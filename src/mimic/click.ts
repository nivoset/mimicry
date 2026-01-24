import { type LanguageModel, generateText, Output } from 'ai'
import { Locator, Page, TestInfo } from '@playwright/test'

import {
  zClickActionResult,
  type ClickActionResult
} from './schema/action.js'
import { countTokens } from '@utils/token-counter.js';
import { addAnnotation } from './annotations.js';
import type { TestContext } from '@/mimic.js';
import { generateBestSelectorForElement } from './selector.js';
import { selectorToPlaywrightCode, generateClickCode } from './playwrightCodeGenerator.js';
import { captureScreenshot, generateAriaSnapshot } from './markers.js';
import type { SelectorDescriptor } from './selectorTypes.js';
import { wrapErrorWithContext } from './errorFormatter.js';

/**
 * Get click action by matching Gherkin step against captured target elements
 * 
 * This function uses AI to analyze a Gherkin step and match it against
 * all available target elements on the page. It returns the top 5 most
 * likely candidates along with the appropriate click type.
 * 
 * @param page - Playwright Page object (currently unused but kept for consistency)
 * @param brain - LanguageModel instance for AI analysis
 * @param gherkinStep - The Gherkin step to match (e.g., "I click on the Submit button")
 * @param targetElements - Array of captured elements with marker IDs from the page
 * @param testContext - Optional test context with previous steps and current state
 * @returns Promise resolving to ClickActionResult with top candidates and click type
 */
export const getClickAction = async (
  page: Page,
  brain: LanguageModel,
  gherkinStep: string,
  testContext?: TestContext,
  testCaseName?: string
): Promise<ClickActionResult> => {
  const startTime = Date.now();
  
  // Capture screenshot with markers and positioning data
  console.log('📸 [getClickAction] Starting screenshot capture with markers...');
  const screenshotStart = Date.now();
  const { image: screenshot, markers: markerData } = await captureScreenshot(page);
  const screenshotTime = Date.now() - screenshotStart;
  console.log(`📸 [getClickAction] Screenshot captured in ${screenshotTime}ms (${(screenshotTime / 1000).toFixed(2)}s)`);
  
  const base64Start = Date.now();
  const screenshotBase64 = screenshot.toString('base64');
  const base64Time = Date.now() - base64Start;
  console.log(`📸 [getClickAction] Screenshot converted to base64 in ${base64Time}ms (${(base64Time / 1000).toFixed(2)}s), size: ${(screenshotBase64.length / 1024).toFixed(2)}KB`);
  
  // Generate accessibility snapshot to explain the screenshot structure
  console.log('🔍 [getClickAction] Generating accessibility snapshot...');
  const ariaSnapshotStart = Date.now();
  const ariaSnapshot = await generateAriaSnapshot(page);
  const ariaSnapshotTime = Date.now() - ariaSnapshotStart;
  console.log(`🔍 [getClickAction] Accessibility snapshot generated in ${ariaSnapshotTime}ms (${(ariaSnapshotTime / 1000).toFixed(2)}s), length: ${ariaSnapshot.length} chars`);
  
  // Convert marker data to format expected by prompt
  const markerStart = Date.now();
  const markerInfo: Array<{ 
    id: number; 
    tag: string; 
    text: string; 
    role: string | null; 
    ariaLabel: string | null;
  }> = markerData?.map(m => {
    
    return {
      id: m.mimicId,
      tag: m.tag,
      text: m.text,
      role: m.role,
      ariaLabel: m.ariaLabel,
    };
  });
  
  const markerTime = Date.now() - markerStart;
  console.log(`🔍 [getClickAction] Processed ${markerInfo.length} markers in ${markerTime}ms (${(markerTime / 1000).toFixed(2)}s)`);
  
  // Build marker summary for the prompt
  const summaryStart = Date.now();
  const markerSummary = markerInfo
    .slice(0, 50) // Limit to first 50 markers to avoid prompt size issues
    .map(m => `  Marker ${m.id}: ${m.tag}${m.role ? ` (role: ${m.role})` : ''}${m.text ? ` - "${m.text.substring(0, 50)}"` : ''}${m.ariaLabel ? ` [aria-label: "${m.ariaLabel}"]` : ''}`)
    .join('\n');
  const summaryTime = Date.now() - summaryStart;
  console.log(`📝 [getClickAction] Built marker summary in ${summaryTime}ms`);
  
  // Build context description for the prompt
  const promptStart = Date.now();
  // Build context description with defensive checks for optional testContext
  // Ensure previousSteps exists and is an array before calling .map()
  const contextDescription = testContext ? `
**Test Context:**
- Current URL: ${testContext.currentState.url}
- Current Page Title: ${testContext.currentState.pageTitle}
- Step ${testContext.currentStepIndex + 1} of ${testContext.totalSteps}
${testContext.previousSteps && Array.isArray(testContext.previousSteps) && testContext.previousSteps.length > 0 ? `
**Previous Steps Executed:**
${testContext.previousSteps.map((prevStep, idx) => 
  `${idx + 1}. Step ${prevStep.stepIndex + 1}: "${prevStep.stepText}" (${prevStep.actionKind}${prevStep.url ? ` → ${prevStep.url}` : ''})`
).join('\n')}
` : ''}
` : '';

  const prompt = `You are an expert Playwright test engineer specializing in mapping Gherkin steps to concrete DOM interactions using visual analysis.

Your task is to analyze:
1. A screenshot of the page with numbered marker badges on elements
2. An accessibility snapshot (provided below) that describes the page structure with roles, names, data-testid, and data-mimic-* attributes
3. A single Gherkin step that implies a click action

**CRITICAL: Click Type Determination**
You must determine the correct click type from the Gherkin step. Use these rules:

**Click Type Equivalencies (these are the SAME):**
- "click", "left click", and "primary click" → use "primary"
- "right click" and "secondary click" → use "secondary"  
- "middle click" and "tertiary click" → use "tertiary"
- "double click" or "double-click" → use "double"

**Default Behavior:**
- If the step just says "click" (without specifying left/right/middle/double), ALWAYS use "primary"
- "click" by itself means a standard left/primary click, NOT a hover

**Hover Rules (STRICT):**
- ONLY use "hover" when the Gherkin step EXPLICITLY mentions "hover", "hover over", or "move mouse over"
- NEVER use "hover" for a step that says "click" - these are DIFFERENT actions
- Hover is ONLY for revealing tooltips, dropdowns, or additional UI elements that appear on mouseover
- If the step says "click", it means click, NOT hover

**Modifier Keys:**
- Detect if modifier keys are mentioned: shift, control (ctrl), alt, meta (command)
- These are optional and should be included in the modifiers field if present

**IMPORTANT**: Look at the screenshot to identify elements by their marker numbers. Each element has a numbered badge:
- **RED badges** = Interactive elements (buttons, links, inputs, etc.)
- **BLUE badges** = Display-only content elements
- **GREEN badges** = Structure/test anchor elements

You must return the **top 5 most likely elements** that the Gherkin step is referring to, identified by their **marker ID numbers** (the numbers shown on the badges in the screenshot).

---

### IMPORTANT RULES

- **ALWAYS use the marker ID (mimicId)** from the screenshot - this is the number shown on the element's badge
- Rank elements from **most likely (rank 1)** to **least likely (rank 5)**
- Prefer **semantic matches** first:
  - Visible text (what you can read in the screenshot)
  - Element position and visual appearance
  - Accessible name (label, aria-label, role)
  - Button / link intent
- Do NOT invent elements or marker IDs - only use marker IDs that are visible in the screenshot
- Do NOT include more than 5 results
- If fewer than 5 reasonable matches exist, return fewer
- Do NOT assume navigation or side effects — this task is only about **what element is clicked**
- For each candidate, provide:
  - The **mimicId** (marker number from the screenshot badge)
  - A **clear, human-readable description** that identifies the element (e.g., "Submit button", "Login link with text 'Sign in'")
  - Element metadata (tag, text, role, etc.) based on what you can see in the screenshot and the marker information provided
- Consider the test context - what steps came before may help identify the correct element

${contextDescription}
**Gherkin Step:**
${gherkinStep}

**Available Markers (${markerInfo.length} total):**
${markerSummary}
${markerInfo.length > 50 ? `\n... and ${markerInfo.length - 50} more markers` : ''}

**Accessibility Snapshot (explains the screenshot structure):**
The following accessibility snapshot describes the page structure with roles, accessible names, data-testid attributes, and data-mimic-* attributes. Use this to understand the page structure alongside the screenshot:
\`\`\`
${ariaSnapshot}
\`\`\`

## Analyze the screenshot and accessibility snapshot, then return up to the top 5 most likely elements that the Gherkin step is referring to.
Use the marker ID numbers (mimicId) shown on the badges in the screenshot and referenced in the accessibility snapshot to identify elements.

**Remember:**
- "click" = primary click (left click) - the default for any click action
- "hover" is ONLY for explicit hover instructions, NEVER for click steps
- When in doubt about click type, default to "primary"
`;
  const promptTime = Date.now() - promptStart;
  console.log(`📝 [getClickAction] Built prompt in ${promptTime}ms, prompt length: ${prompt.length} chars`);

  // Build message content - try without image first, then retry with image if needed
  const messageStart = Date.now();
  // First attempt: text-only (no image) - faster and cheaper
  const messageContentTextOnly: Array<{ type: 'text'; text: string }> = [
    { type: 'text', text: prompt }
  ];
  
  // Second attempt: with image (if first attempt fails)
  const messageContentWithImage: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [
    { type: 'text', text: prompt },
    { type: 'image', image: screenshotBase64 }
  ];
  const messageTime = Date.now() - messageStart;
  console.log(`📨 [getClickAction] Built message content in ${messageTime}ms`);

  // Set explicit timeout for AI calls to prevent indefinite hangs
  // 2 minutes should be sufficient for most AI responses, even with retries
  const aiTimeout = 120_000; // 2 minutes
  let res;
  let aiTime: number;
  let usedImage = false;

  // First attempt: try without image (text-only with accessibility snapshot)
  console.log('🤖 [getClickAction] Calling AI model (text-only, no image)...');
  const aiStart = Date.now();
  try {
    res = await Promise.race([
      generateText({
        model: brain,
        messages: [
          { 
            role: 'user', 
            content: messageContentTextOnly
          }
        ],
        maxRetries: 2, // Fewer retries for first attempt
        output: Output.object({ schema: zClickActionResult, name: 'clickActionResult' }),
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`AI model call timed out after ${aiTimeout}ms`)), aiTimeout)
      )
    ]);
    
    // Validate the response
    if (!res.output || !res.output.candidates || !Array.isArray(res.output.candidates) || res.output.candidates.length === 0) {
      throw new Error('First attempt returned invalid result, retrying with image...');
    }
    
    aiTime = Date.now() - aiStart;
    console.log(`✅ [getClickAction] AI model responded successfully (text-only) in ${aiTime}ms (${(aiTime / 1000).toFixed(2)}s)`);
  } catch (error) {
    // First attempt failed - retry with image
    console.log(`⚠️  [getClickAction] First attempt failed, retrying with image: ${error instanceof Error ? error.message : String(error)}`);
    const retryStart = Date.now();
    usedImage = true;
    
    try {
      res = await Promise.race([
        generateText({
          model: brain,
          messages: [
            { 
              role: 'user', 
              content: messageContentWithImage
            }
          ],
          maxRetries: 3,
          output: Output.object({ schema: zClickActionResult, name: 'clickActionResult' }),
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`AI model call timed out after ${aiTimeout}ms`)), aiTimeout)
        )
      ]);
      
      aiTime = Date.now() - retryStart;
      console.log(`✅ [getClickAction] AI model responded successfully (with image) in ${aiTime}ms (${(aiTime / 1000).toFixed(2)}s)`);
    } catch (retryError) {
      const elapsed = Date.now() - aiStart;
      throw new Error(`AI model call failed after ${elapsed}ms (tried both text-only and with image): ${retryError instanceof Error ? retryError.message : String(retryError)}`);
    }
  }
  
  await countTokens(res, testCaseName);

  const totalTime = Date.now() - startTime;
  console.log(`⏱️  [getClickAction] Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)${usedImage ? ' (used image on retry)' : ' (text-only, no image needed)'}`);
  console.log(`   Breakdown: screenshot=${screenshotTime}ms, base64=${base64Time}ms, markers=${markerTime}ms, summary=${summaryTime}ms, prompt=${promptTime}ms, message=${messageTime}ms, AI=${aiTime}ms`);

  // Validate that the AI model returned a valid structured output
  // The output should always be defined when using structured outputs, but add defensive check
  if (!res.output) {
    throw new Error('AI model failed to generate valid click action result. The output is undefined.');
  }

  // Validate that candidates array exists and is not empty
  if (!res.output.candidates || !Array.isArray(res.output.candidates) || res.output.candidates.length === 0) {
    throw new Error(`AI model returned invalid click action result: candidates array is missing, not an array, or empty. Received: ${JSON.stringify(res.output)}`);
  }

  return res.output;
};

/**
 * Execute a click action on a page element with plain English annotation
 * 
 * This function performs the actual click interaction and logs what action
 * is being performed in human-readable terms for better test traceability.
 * Uses the LLM-generated description from the selected candidate.
 * 
 * @param element - Playwright Locator for the target element to interact with
 * @param clickActionResult - Click action result containing click type and target information
 * @param selectedCandidate - The selected candidate element with LLM-generated description
 * @param testInfo - Playwright TestInfo for adding annotations
 * @param gherkinStep - The original Gherkin step for annotation type
 * @returns Promise that resolves to an object containing the action result and selector (for snapshot storage)
 */
export const executeClickAction = async (
  element: Locator | null,
  clickActionResult: ClickActionResult,
  selectedCandidate: ClickActionResult['candidates'][0],
  testInfo: TestInfo | undefined,
  gherkinStep: string,
): Promise<{ actionResult: ClickActionResult; selector: SelectorDescriptor | null }> => {
  // Use the LLM-generated description from the candidate
  // This description was created by the AI when matching the element
  const elementDescription = selectedCandidate.description || 'element';

  // Check if element is valid before attempting click
  if (!element) {
    throw new Error(`Cannot click: element not found or page may be closed`);
  }

  // Build annotation description based on click type
  let annotationDescription = '';
  switch (clickActionResult.clickType) {
    case 'primary':
      annotationDescription = `→ Clicking on ${elementDescription} with left mouse button`;
      break;
    case 'secondary':
      annotationDescription = `→ Right-clicking on ${elementDescription} to open context menu`;
      break;
    case 'double':
      annotationDescription = `→ Double-clicking on ${elementDescription} to activate`;
      break;
    case 'tertiary':
      annotationDescription = `→ Clicking on ${elementDescription} with middle mouse button`;
      break;
    case 'hover':
      annotationDescription = `→ Hovering over ${elementDescription} to reveal additional options`;
      break;
    default:
      throw new Error(`Unknown click type: ${clickActionResult.clickType}`);
  }

  // Generate Playwright code equivalent BEFORE performing the action
  // This ensures the element is still available (before navigation/closure)
  let playwrightCode: string | undefined;
  let selector: SelectorDescriptor | null = null;
  
  try {
    // Generate the best selector descriptor from the element
    // This gives us a descriptive, stable selector for snapshot storage
    // Use 30-second timeout for selector generation
    const selectorDescriptor = await generateBestSelectorForElement(element, { timeout: 30000 });
    const selectorCode = selectorToPlaywrightCode(selectorDescriptor);
    playwrightCode = generateClickCode(selectorCode, clickActionResult.clickType);
    
    // Store the selector descriptor for snapshot storage
    selector = selectorDescriptor;
  } catch (error: any) {
    // If generating from element fails, fall back to mimicId if available
    // This can happen if the element is not available or page is closing
    const errorMessage = error?.message || String(error);
    
    // Check if page closed - this can happen with navigation after clicks
    if (errorMessage.includes('closed') || errorMessage.includes('Target page')) {
      console.warn('Page closed during selector generation, using mimicId fallback');
    }
    
    if (selectedCandidate.mimicId) {
      const selectorCode = `page.locator('[data-mimic-id="${selectedCandidate.mimicId}"]')`;
      playwrightCode = generateClickCode(selectorCode, clickActionResult.clickType);
      // Create a CSS selector descriptor as fallback
      selector = {
        type: 'css',
        selector: `[data-mimic-id="${selectedCandidate.mimicId}"]`
      };
    } else {
      // If we can't generate the code, that's okay - just skip it
      console.warn('Could not generate Playwright code for click action:', errorMessage);
    }
  }

  // Add annotation using centralized utility (includes Playwright code if available)
  addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);

  // Perform the click action
  // Check if this is a link that might cause navigation
  const isLink = await element.evaluate((el) => {
    return el.tagName === 'A' || el.getAttribute('role') === 'link';
  }).catch(() => false);

  try {
    switch (clickActionResult.clickType) {
      case 'primary':
        // Playwright's click() automatically waits for navigation when clicking links
        // However, for client-side routing, we add an additional wait after the click
        await element.click();
        
        // After clicking a link, wait for network to be idle to ensure client-side routing completes
        // This helps with SPAs and client-side navigation that might not trigger full page loads
        if (isLink) {
          try {
            // Wait for network to be idle, but don't fail if it times out
            // Some pages might have ongoing network activity
            await element.page().waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
              // Timeout is acceptable - page might already be stable or have ongoing activity
              console.log('⏳ [executeClickAction] Network idle wait completed or timed out');
            });
          } catch {
            // Ignore errors - page might already be loaded or navigation might not have occurred
          }
        }
        break;
      case 'secondary':
        await element.click({ button: 'right' });
        break;
      case 'double':
        await element.dblclick();
        break;
      case 'tertiary':
        await element.click({ button: 'middle' });
        break;
      case 'hover':
        await element.hover();
        break;
      default:
        throw new Error(`Unknown click type: ${clickActionResult.clickType}`);
    }
  } catch (error) {
    // Wrap error with Playwright code context for better error messages
    throw wrapErrorWithContext(
      error,
      playwrightCode,
      annotationDescription,
      gherkinStep
    );
  }
  
  // Return action result and selector for snapshot storage
  return { actionResult: clickActionResult, selector };
};