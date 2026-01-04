import { type LanguageModel, generateText, Output } from 'ai'
import { Locator, Page, TestInfo } from '@playwright/test'

import {
  zClickActionResult,
  type ClickActionResult
} from './schema/action.js'
import type { TargetInfo } from './selector.js'
import { countTokens } from '../utils/token-counter.js';
import { addAnnotation } from './annotations.js';
import type { TestContext } from '../mimic.js';

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
 * @param targetElements - Array of captured target elements from the page
 * @param testContext - Optional test context with previous steps and current state
 * @returns Promise resolving to ClickActionResult with top candidates and click type
 */
export const getClickAction = async (
  _page: Page,
  brain: LanguageModel,
  gherkinStep: string,
  targetElements: TargetInfo[],
  testContext?: TestContext
): Promise<ClickActionResult> => {
  // Format target elements with their indices for the prompt
  // Include all relevant identifying information
  const elementsWithIndices = targetElements.map((element, index) => ({
    index,
    tag: element.tag,
    text: element.text,
    id: element.id,
    role: element.role,
    label: element.label,
    ariaLabel: element.ariaLabel,
    typeAttr: element.typeAttr,
    nameAttr: element.nameAttr,
    href: element.href,
    dataset: element.dataset,
    nthOfType: element.nthOfType,
  }));

  // Group elements by tag type
  const elementsByTag = new Map<string, typeof elementsWithIndices>();
  for (const el of elementsWithIndices) {
    const tagKey = el.tag === 'a' ? 'links' : el.tag === 'button' ? 'buttons' : el.tag === 'input' ? 'inputs' : el.tag;
    if (!elementsByTag.has(tagKey)) {
      elementsByTag.set(tagKey, []);
    }
    elementsByTag.get(tagKey)!.push(el);
  }

  // Format element fields in selector priority order, skipping null/empty values
  const formatElement = (roleSection: string )  => (el: typeof elementsWithIndices[0]): string => {
    const parts: string[] = [];
    
    // Priority order: testId → text → role → ariaLabel → label → name → type → href → dataAttributes → tag → id → nthOfType
    if (el.dataset.testid) {
      parts.push(`  testId: "${el.dataset.testid}"`);
    }
    if (el.text && el.text.trim()) {
      parts.push(`  text: "${el.text.trim()}"`);
    }
    if (el.role && roleSection !== el.role) {
      parts.push(`  role: ${el.role}`);
    }
    if (el.ariaLabel) {
      parts.push(`  ariaLabel: "${el.ariaLabel}"`);
    }
    if (el.label) {
      parts.push(`  label: "${el.label}"`);
    }
    if (el.nameAttr) {
      parts.push(`  name: "${el.nameAttr}"`);
    }
    if (el.typeAttr) {
      parts.push(`  type: ${el.typeAttr}`);
    }
    if (el.href) {
      parts.push(`  href: "${el.href}"`);
    }
    if (Object.keys(el.dataset).length > 0) {
      const dataKeys = Object.keys(el.dataset).filter(k => k !== 'testid');
      if (dataKeys.length > 0) {
        parts.push(`  dataAttributes: ${JSON.stringify(dataKeys)}`);
      }
    }
    parts.push(`  tag: ${el.tag}`);
    // if (el.id) {
    //   parts.push(`  id: "${el.id}"`);
    // }
    parts.push(`  index: ${el.index}`);
    if (el.nthOfType > 1) {
      parts.push(`  nthOfType: ${el.nthOfType}`);
    }
    
    return `  - ${parts.join('\n    ')}`;
  };

  // Create formatted description grouped by tag
  const elementsDescription = Array.from(elementsByTag.entries())
    .map(([tagKey, elements]) => {
      const formattedElements = elements.map(formatElement(tagKey)).join('\n');
      return `${tagKey}:\n${formattedElements}`;
    })
    .join('\n\n');

  // Build context description for the prompt
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

  const prompt = `You are an expert Playwright test engineer specializing in mapping Gherkin steps to concrete DOM interactions.

Your task is to analyze:
1. A single Gherkin step that implies a click action.
2. A list of candidate DOM elements extracted from the page.

You must return the **top 5 most likely elements** that the Gherkin step is referring to.

---

### IMPORTANT RULES

- Rank elements from **most likely (rank 1)** to **least likely (rank 5)**.
- Prefer **semantic matches** first:
  - Visible text
  - Accessible name (label, aria-label, role)
  - Button / link intent
- Use "index" **only as a secondary disambiguation signal**, never as the primary reason.
- Do NOT invent elements or field values.
- Do NOT include more than 5 results.
- If fewer than 5 reasonable matches exist, return fewer.
- Do NOT assume navigation or side effects — this task is only about **what element is clicked**.
- For each candidate, provide a **clear, human-readable description** that identifies the element (e.g., "Submit button", "Login link with text 'Sign in'", "Email input field labeled 'Email address'"). This description will be used in test annotations.
- Consider the test context - what steps came before may help identify the correct element.

${contextDescription}
**Gherkin Step:**
${gherkinStep}

**Available Target Elements (${targetElements.length} total):**
${elementsDescription}


## Reason and return up to the top 5 most likely elements that the Gherkin step is referring to.
`;

  const res = await generateText({
    model: brain,
    prompt,
    maxRetries: 3,
    output: Output.object({ schema: zClickActionResult, name: 'clickActionResult' }),
  });
  
  await countTokens(res);

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
): Promise<{ actionResult: ClickActionResult; selector: string | null }> => {
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
    case 'left':
      annotationDescription = `→ Clicking on ${elementDescription} with left mouse button`;
      break;
    case 'right':
      annotationDescription = `→ Right-clicking on ${elementDescription} to open context menu`;
      break;
    case 'double':
      annotationDescription = `→ Double-clicking on ${elementDescription} to activate`;
      break;
    case 'middle':
      annotationDescription = `→ Clicking on ${elementDescription} with middle mouse button`;
      break;
    case 'hover':
      annotationDescription = `→ Hovering over ${elementDescription} to reveal additional options`;
      break;
    default:
      throw new Error(`Unknown click type: ${clickActionResult.clickType}`);
  }

  // Add annotation using centralized utility
  addAnnotation(testInfo, gherkinStep, annotationDescription);

  // Get selector string for snapshot storage
  // Try to get a CSS selector representation if possible
  let selector: string | null = null;
  try {
    // Attempt to get a selector string from the locator
    // This is best-effort and may not always work
    const locatorString = element.toString();
    if (locatorString && locatorString !== '[object Object]') {
      selector = locatorString;
    }
  } catch (error) {
    // If we can't get selector, that's okay - we'll rebuild from TargetInfo
  }

  // Perform the click action
  switch (clickActionResult.clickType) {
    case 'left':
      await element.click();
      break;
    case 'right':
      await element.click({ button: 'right' });
      break;
    case 'double':
      await element.dblclick();
      break;
    case 'middle':
      await element.click({ button: 'middle' });
      break;
    case 'hover':
      await element.hover();
      break;
    default:
      throw new Error(`Unknown click type: ${clickActionResult.clickType}`);
  }
  
  // Return action result and selector for snapshot storage
  return { actionResult: clickActionResult, selector };
};