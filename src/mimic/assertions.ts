/**
 * Assertion Action Module
 * 
 * Handles assertion actions like visibility checks, text verification, value checks, etc.
 * Supports dynamic text normalization to handle timestamps and other changing content.
 */

import { Locator, Page, TestInfo, expect } from '@playwright/test';
import { type LanguageModel, generateText, Output } from 'ai';
import { z } from 'zod';
import { countTokens } from '@utils/token-counter.js';
import { generateBestSelectorForElement } from './selector.js';
import { addAnnotation } from './annotations.js';
import type { TestContext } from '@/mimic.js';
import { selectorToPlaywrightCode, generateAssertionCode } from './playwrightCodeGenerator.js';
import { captureScreenshot, generateAriaSnapshot } from './markers.js';
import type { SelectorDescriptor } from './selectorTypes.js';
import { wrapErrorWithContext } from './errorFormatter.js';

/**
 * Assertion types supported by mimic
 */
export const zAssertionType = z.enum([
  'visible',
  'notVisible',
  'text',
  'textContains',
  'value',
  'checked',
  'notChecked',
  'enabled',
  'disabled',
  'count',
  'url',
  'title',
]).describe('Type of assertion to perform');

/**
 * Assertion action result schema
 */
export const zAssertionActionResult = z.object({
  /**
   * The mimic ID (marker number) of the target element (if applicable)
   * For URL/title assertions, this may be null
   */
  mimicId: z.number().int().min(1).nullable().describe("The mimic ID (marker number) shown on the element's badge in the screenshot, or null for page-level assertions"),
  /**
   * Type of assertion to perform
   */
  type: zAssertionType,
  /**
   * Expected value for the assertion (text, value, URL, etc.)
   * For visibility/checked assertions, this may be empty or boolean string
   */
  expected: z.string().describe("Expected value to assert (text, value, URL, etc.). For visibility/checked, use 'true' or 'false'"),
  /**
   * For text assertions: whether to normalize dynamic content (timestamps, dates, etc.)
   */
  normalizeDynamicContent: z.boolean().default(false).describe("Whether to normalize dynamic content in text assertions (remove timestamps, dates, etc.)"),
  /**
   * Human-readable description of what is being asserted
   */
  description: z.string().describe("Human-readable description of the assertion for test annotations"),
});

export type AssertionActionResult = z.infer<typeof zAssertionActionResult>;

/**
 * Normalize text by removing dynamic content patterns
 * 
 * Removes common dynamic patterns like:
 * - Timestamps (e.g., "2 minutes ago", "2024-01-23 10:30:45")
 * - Dates (e.g., "Jan 23, 2024", "01/23/2024")
 * - Times (e.g., "10:30 AM", "14:30")
 * - Numbers that change (IDs, counts, etc.) - replaced with placeholders
 * - Relative times (e.g., "just now", "yesterday")
 * 
 * @param text - Text to normalize
 * @returns Normalized text with dynamic patterns replaced
 */
export function normalizeDynamicText(text: string): string {
  let normalized = text;
  
  // Remove timestamps (ISO format, common formats)
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?/g, '[TIMESTAMP]');
  
  // Remove relative time expressions
  normalized = normalized.replace(/\b(just now|a moment ago|\d+\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s*ago|yesterday|today|tomorrow)\b/gi, '[TIME]');
  
  // Remove date patterns (various formats)
  normalized = normalized.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi, '[DATE]');
  normalized = normalized.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '[DATE]');
  normalized = normalized.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[DATE]');
  
  // Remove time patterns (12-hour and 24-hour)
  normalized = normalized.replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM|am|pm)?\b/g, '[TIME]');
  
  // Remove standalone numbers that might be IDs or counts (but preserve numbers in context)
  // This is more conservative - only replace numbers that appear isolated
  normalized = normalized.replace(/\b\d{4,}\b/g, '[NUMBER]'); // Long numbers likely IDs
  
  // Remove UUIDs
  normalized = normalized.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[UUID]');
  
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Get assertion action from Gherkin step
 * 
 * Uses AI to determine what assertion to perform and which element to assert on.
 * 
 * @param page - Playwright Page object
 * @param brain - Language model for intent analysis
 * @param gherkinStep - Gherkin step text (e.g., "verify that the submit button is visible")
 * @param testContext - Test context with previous steps and current state
 * @param testCaseName - Test case name for token tracking
 * @returns Assertion action result with target element and assertion type
 */
export async function getAssertionAction(
  page: Page,
  brain: LanguageModel,
  gherkinStep: string,
  testContext?: TestContext,
  testCaseName?: string
): Promise<AssertionActionResult> {
  // Capture screenshot with markers
  console.log('📸 [getAssertionAction] Starting screenshot capture with markers...');
  const { markers: markerData } = await captureScreenshot(page);
  
  // Generate accessibility snapshot
  const ariaSnapshot = await generateAriaSnapshot(page);
  
  // Convert marker data to format expected by prompt
  const markerInfo: Array<{ 
    id: number; 
    tag: string; 
    text: string; 
    role: string | null; 
    ariaLabel: string | null;
  }> = (Array.isArray(markerData) ? markerData : []).map(m => ({
    id: m.mimicId,
    tag: m.tag,
    text: m.text,
    role: m.role,
    ariaLabel: m.ariaLabel,
  }));
  
  // Build context description
  const contextDescription = testContext ? `
**Test Context:**
- Current URL: ${testContext.currentState.url}
- Current Page Title: ${testContext.currentState.pageTitle}
- Step ${testContext.currentStepIndex + 1} of ${testContext.totalSteps}
${testContext.previousSteps.length > 0 ? `
**Previous Steps Executed:**
${testContext.previousSteps.map((prevStep, idx) => 
  `${idx + 1}. Step ${prevStep.stepIndex + 1}: "${prevStep.stepText}" (${prevStep.actionKind}${prevStep.url ? ` → ${prevStep.url}` : ''})`
).join('\n')}
` : ''}
` : '';
  
  // Filter markers to relevant ones (all markers for assertions - we might assert on any element)
  const allMarkers = markerInfo;
  const markerSummary = allMarkers.slice(0, 100).map(m => 
    `- Marker #${m.id}: ${m.tag}${m.role ? ` [role: ${m.role}]` : ''}${m.text ? ` "${m.text.substring(0, 50)}${m.text.length > 50 ? '...' : ''}"` : ''}${m.ariaLabel ? ` (aria-label: ${m.ariaLabel})` : ''}`
  ).join('\n');
  
  const prompt = `You are an expert Playwright test engineer specializing in mapping Gherkin assertion steps to concrete DOM verifications.

Your task is to analyze:
1. A screenshot of the page with numbered marker badges on elements
2. An accessibility snapshot (provided below) that describes the page structure
3. A single Gherkin step that implies an assertion/verification

**CRITICAL: Assertion Type Determination**

You must determine the correct assertion type from the Gherkin step. Use these rules:

**Assertion Type Equivalencies:**
- "is visible", "should be visible", "appears", "is shown" → use "visible"
- "is not visible", "should not be visible", "is hidden", "does not appear" → use "notVisible"
- "text is", "text equals", "contains text", "has text" → use "text" or "textContains"
- "value is", "value equals" → use "value"
- "is checked", "should be checked", "is selected" → use "checked"
- "is not checked", "should not be checked", "is not selected" → use "notChecked"
- "is enabled", "should be enabled" → use "enabled"
- "is disabled", "should be disabled" → use "disabled"
- "count is", "number of" → use "count"
- "URL is", "URL equals", "page URL is" → use "url" (mimicId will be null)
- "title is", "page title is" → use "title" (mimicId will be null)

**Text Assertion Rules:**
- If step says "contains" or "includes" → use "textContains"
- If step says "is" or "equals" → use "text"
- For text assertions, set normalizeDynamicContent to true if the text might contain timestamps, dates, or other dynamic content

**Element Selection:**
- For element assertions, identify the element by its marker ID (mimicId)
- For page-level assertions (URL, title), set mimicId to null
- Use the marker ID numbers shown on the badges in the screenshot

**Expected Value Extraction:**
- Extract the expected value from the Gherkin step
- For visibility: use "true" or "false"
- For checked: use "true" or "false"
- For text: extract the exact expected text (or partial text for textContains)
- For URL/title: extract the expected URL or title

${contextDescription}
**Gherkin Step:**
${gherkinStep}

**Available Markers (${allMarkers.length} total):**
${markerSummary}
${allMarkers.length > 100 ? `\n... and ${allMarkers.length - 100} more markers` : ''}

**Accessibility Snapshot:**
\`\`\`
${ariaSnapshot}
\`\`\`

**Current Page State:**
- URL: ${page.url()}
- Title: ${await page.title().catch(() => 'Unknown')}

Analyze the screenshot and determine:
1. Which element (by mimicId/marker number) is being asserted on, or null for page-level assertions
2. What assertion type to perform
3. What expected value to use
4. Whether to normalize dynamic content (for text assertions)
5. A clear description of what is being asserted`;

  const result = await generateText({
    model: brain,
    prompt,
    output: Output.object({ schema: zAssertionActionResult, name: 'assertionAction' }),
  });
  
  await countTokens(result, testCaseName);
  
  const actionResult = result.output;
  console.log(`✅ [getAssertionAction] Determined assertion: ${actionResult.type} on element ${actionResult.mimicId || 'page'}`);
  
  return actionResult;
}

/**
 * Execute an assertion action
 * 
 * Performs the actual Playwright assertion based on the assertion action result.
 * 
 * @param page - Playwright Page object
 * @param assertionAction - Assertion action result from getAssertionAction
 * @param targetElement - Target element locator (if applicable, null for page-level assertions)
 * @param testInfo - Playwright TestInfo for annotations
 * @param stepText - Original step text for annotations
 * @returns Object with selector descriptor and assertion result
 */
export async function executeAssertionAction(
  page: Page,
  assertionAction: AssertionActionResult,
  targetElement: Locator | null,
  testInfo?: TestInfo,
  stepText?: string
): Promise<{ selector: SelectorDescriptor | null; assertionPassed: boolean }> {
  const elementDescription = assertionAction.description;
  let selector: SelectorDescriptor | null = null;
  let assertionPassed = false;
  let annotationDescription = '';
  let playwrightCode = '';
  
  // Generate selector if we have a target element
  if (targetElement) {
    try {
      selector = await generateBestSelectorForElement(targetElement);
      const selectorCode = selectorToPlaywrightCode(selector);
      playwrightCode = selectorCode;
    } catch (error) {
      console.warn(`⚠️  Could not generate selector for assertion target: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  try {
    switch (assertionAction.type) {
      case 'visible':
        if (!targetElement) {
          throw new Error('Visibility assertion requires a target element');
        }
        await expect(targetElement).toBeVisible();
        annotationDescription = `✓ Asserting that ${elementDescription} is visible`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'visible', '');
        }
        assertionPassed = true;
        break;
        
      case 'notVisible':
        if (!targetElement) {
          throw new Error('Not visible assertion requires a target element');
        }
        await expect(targetElement).not.toBeVisible();
        annotationDescription = `✓ Asserting that ${elementDescription} is not visible`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'notVisible', '');
        }
        assertionPassed = true;
        break;
        
      case 'text':
        if (!targetElement) {
          throw new Error('Text assertion requires a target element');
        }
        let expectedText = assertionAction.expected;
        let actualText = await targetElement.textContent();
        
        // Normalize dynamic content if requested
        if (assertionAction.normalizeDynamicContent && actualText) {
          const normalizedActual = normalizeDynamicText(actualText);
          const normalizedExpected = normalizeDynamicText(expectedText);
          if (normalizedActual === normalizedExpected) {
            assertionPassed = true;
          } else {
            // Try exact match as fallback
            if (actualText.trim() === expectedText.trim()) {
              assertionPassed = true;
            } else {
              throw new Error(`Text assertion failed: expected "${expectedText}" (normalized: "${normalizedExpected}"), got "${actualText}" (normalized: "${normalizedActual}")`);
            }
          }
        } else {
          // Exact text match
          await expect(targetElement).toHaveText(expectedText);
          assertionPassed = true;
        }
        annotationDescription = `✓ Asserting that ${elementDescription} has text "${expectedText}"`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'text', expectedText, assertionAction.normalizeDynamicContent);
        }
        break;
        
      case 'textContains':
        if (!targetElement) {
          throw new Error('Text contains assertion requires a target element');
        }
        const expectedSubstring = assertionAction.expected;
        let actualTextContent = await targetElement.textContent();
        
        // Normalize dynamic content if requested
        if (assertionAction.normalizeDynamicContent && actualTextContent) {
          const normalizedActual = normalizeDynamicText(actualTextContent);
          const normalizedExpected = normalizeDynamicText(expectedSubstring);
          if (normalizedActual.includes(normalizedExpected)) {
            assertionPassed = true;
          } else {
            // Try without normalization as fallback
            if (actualTextContent.includes(expectedSubstring)) {
              assertionPassed = true;
            } else {
              throw new Error(`Text contains assertion failed: expected to contain "${expectedSubstring}", got "${actualTextContent}"`);
            }
          }
        } else {
          // Simple contains check
          await expect(targetElement).toContainText(expectedSubstring);
          assertionPassed = true;
        }
        annotationDescription = `✓ Asserting that ${elementDescription} contains text "${expectedSubstring}"`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'textContains', expectedSubstring, assertionAction.normalizeDynamicContent);
        }
        break;
        
      case 'value':
        if (!targetElement) {
          throw new Error('Value assertion requires a target element');
        }
        const expectedValue = assertionAction.expected;
        await expect(targetElement).toHaveValue(expectedValue);
        annotationDescription = `✓ Asserting that ${elementDescription} has value "${expectedValue}"`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'value', expectedValue);
        }
        assertionPassed = true;
        break;
        
      case 'checked':
        if (!targetElement) {
          throw new Error('Checked assertion requires a target element');
        }
        await expect(targetElement).toBeChecked();
        annotationDescription = `✓ Asserting that ${elementDescription} is checked`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'checked', '');
        }
        assertionPassed = true;
        break;
        
      case 'notChecked':
        if (!targetElement) {
          throw new Error('Not checked assertion requires a target element');
        }
        await expect(targetElement).not.toBeChecked();
        annotationDescription = `✓ Asserting that ${elementDescription} is not checked`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'notChecked', '');
        }
        assertionPassed = true;
        break;
        
      case 'enabled':
        if (!targetElement) {
          throw new Error('Enabled assertion requires a target element');
        }
        await expect(targetElement).toBeEnabled();
        annotationDescription = `✓ Asserting that ${elementDescription} is enabled`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'enabled', '');
        }
        assertionPassed = true;
        break;
        
      case 'disabled':
        if (!targetElement) {
          throw new Error('Disabled assertion requires a target element');
        }
        await expect(targetElement).toBeDisabled();
        annotationDescription = `✓ Asserting that ${elementDescription} is disabled`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'disabled', '');
        }
        assertionPassed = true;
        break;
        
      case 'count':
        if (!targetElement) {
          throw new Error('Count assertion requires a target element');
        }
        const expectedCount = parseInt(assertionAction.expected, 10);
        if (isNaN(expectedCount)) {
          throw new Error(`Invalid count value: ${assertionAction.expected}`);
        }
        const actualCount = await targetElement.count();
        if (actualCount !== expectedCount) {
          throw new Error(`Count assertion failed: expected ${expectedCount}, got ${actualCount}`);
        }
        annotationDescription = `✓ Asserting that ${elementDescription} has count ${expectedCount}`;
        if (playwrightCode) {
          playwrightCode = generateAssertionCode(playwrightCode, 'count', assertionAction.expected);
        }
        assertionPassed = true;
        break;
        
      case 'url':
        // Page-level assertion, no target element needed
        const expectedUrl = assertionAction.expected;
        await expect(page).toHaveURL(new RegExp(expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        annotationDescription = `✓ Asserting that page URL matches "${expectedUrl}"`;
        playwrightCode = generateAssertionCode(null, 'url', expectedUrl);
        assertionPassed = true;
        break;
        
      case 'title':
        // Page-level assertion, no target element needed
        const expectedTitle = assertionAction.expected;
        await expect(page).toHaveTitle(new RegExp(expectedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        annotationDescription = `✓ Asserting that page title matches "${expectedTitle}"`;
        playwrightCode = generateAssertionCode(null, 'title', expectedTitle);
        assertionPassed = true;
        break;
        
      default:
        throw new Error(`Unknown assertion type: ${(assertionAction as any).type}`);
    }
    
    // Add annotation for successful assertion
    if (testInfo && stepText) {
      addAnnotation(testInfo, 'assertion', annotationDescription);
      if (playwrightCode) {
        addAnnotation(testInfo, 'playwright-code', playwrightCode);
      }
    }
    
    return { selector, assertionPassed };
  } catch (error) {
    // Add annotation for failed assertion
    if (testInfo && stepText) {
      addAnnotation(testInfo, 'assertion-failed', `✗ Assertion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Wrap error with Playwright code context for better error messages
    throw wrapErrorWithContext(
      error,
      playwrightCode || undefined,
      annotationDescription || `Assertion: ${assertionAction.type}`,
      stepText
    );
  }
}
