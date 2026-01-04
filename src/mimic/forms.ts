import { Locator, Page, TestInfo } from '@playwright/test';
import { type LanguageModel, generateText, Output } from 'ai'
import z from 'zod';
import { countTokens } from '../utils/token-counter';
import { TargetInfo } from './selector';
import { addAnnotation } from './annotations.js';
import type { TestContext } from '../mimic.js';

const zFormActionResult = z.object({
  type: z.enum(['keypress', 'type', 'fill', 'select', 'uncheck', 'check', 'setInputFiles', 'clear']),
  params: z.object({
    value: z.string().describe("Value to set for the form update."),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift', 'none'])).describe("Optional modifier keys to use for the form update."),
  }),
  /**
   * Human-readable description of the target form element for test annotations
   * Should clearly identify which form field is being interacted with (e.g., "Email input field", "Submit button", "Country dropdown")
   */
  elementDescription: z.string().describe("Human-readable description of the target form element for test annotations"),
})


export type FormActionResult = z.infer<typeof zFormActionResult>;

export const getFormAction = async (
  _page: Page,
  brain: LanguageModel,
  gherkinStep: string,
  targetElements: TargetInfo[],
  testContext?: TestContext
): Promise<FormActionResult> => {

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

  const res = await generateText({
    model: brain,
    prompt: `You are an expert Playwright test engineer specializing in mapping Gherkin steps to form interactions.

Your task is to analyze:
1. A single Gherkin step that implies a form update action (typing, filling, selecting, checking, etc.).
2. A list of candidate form elements extracted from the page.

You must determine:
- The type of form action (fill, type, select, check, uncheck, clear, etc.)
- The value to use (text to type, option to select, etc.)

${contextDescription}
**Gherkin Step:**
${gherkinStep}

**Available Form Elements (${targetElements.length} total):**
${elementsDescription}

**Action Types:**
- fill: Replace all content in a field with text (USE THIS for typing text like email addresses, names, etc.)
- type: Type text character by character (slower, simulates real typing - use when needed for special cases)
- select: Select an option from dropdown/select element
- check: Check a checkbox (USE THIS when step says "check" or "select" a checkbox)
- uncheck: Uncheck a checkbox (USE THIS when step says "uncheck" or "deselect" a checkbox)
- clear: Clear field content
- keypress: Press a SINGLE KEY ONLY (e.g., "Enter", "Tab", "Escape", "ArrowDown") - DO NOT use for typing text strings or checkboxes
- setInputFiles: Upload a file

**IMPORTANT:**
- For typing text (email addresses, names, messages, etc.), ALWAYS use "fill" or "type", NEVER "keypress"
- For checkboxes, ALWAYS use "check" or "uncheck", NEVER "keypress"
- "keypress" is ONLY for single keyboard keys like "Enter", "Tab", "Escape", "ArrowUp", "ArrowDown", etc.
- If the step says "type X into Y" or "fill Y with X", use "fill" (preferred) or "type", NOT "keypress"
- If the step says "check" or "select" a checkbox, use "check", NOT "keypress"

**Instructions:**
1. Identify what form action is being requested
2. Extract the value from the step (text to type, option to select, etc.)
3. Identify which form element is being targeted (name field, email field, submit button, etc.)
4. Return the appropriate action type, value, and a clear description of the target element
   - The elementDescription should clearly identify the form field (e.g., "Email input field", "Name field labeled 'Full Name'", "Submit button", "Country dropdown")

Think step-by-step about what the user wants to do with the form.`,
    output: Output.object({ schema: zFormActionResult, name: 'formActionResult' }),
    maxRetries: 3,
  });
  await countTokens(res);
  return res.output;
}


/**
 * Execute a form action on a page element with plain English annotation
 * 
 * This function performs form interactions (typing, selecting, checking, etc.)
 * and adds test annotations for better traceability and validation.
 * Uses the LLM-generated element description from the form action result.
 * 
 * @param page - Playwright Page object for keyboard actions
 * @param formActionResult - Form action result containing action type, parameters, and element description
 * @param targetElement - Playwright Locator for the target form element
 * @param testInfo - Playwright TestInfo for adding annotations (optional)
 * @param gherkinStep - The original Gherkin step for annotation type (optional)
 * @returns Promise that resolves when the form action is complete
 */
export const executeFormAction = async (
  page: Page,
  formActionResult: FormActionResult,
  targetElement: Locator | null,
  testInfo?: TestInfo,
  gherkinStep?: string
): Promise<void | string[]> => {
  if (targetElement === null) {
    throw new Error('No target element found');
  }

  // Use LLM-generated description from the form action result
  const elementDescription = formActionResult.elementDescription || 'form field';
  let annotationDescription = '';

  // Get selector string for snapshot storage
  // Try to get a CSS selector representation if possible
  let selector: string | null = null;
  try {
    // Attempt to get a selector string from the locator
    // This is best-effort and may not always work
    const locatorString = targetElement.toString();
    if (locatorString && locatorString !== '[object Object]') {
      selector = locatorString;
    }
  } catch (error) {
    // If we can't get selector, that's okay - we'll rebuild from TargetInfo
  }

  // Perform the form action with appropriate plain English annotation
  switch (formActionResult.type) {
    case 'keypress':
      // Validate that keypress is only used for single keys, not text strings
      const keyValue = formActionResult.params.value;
      const validSingleKeys = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
      
      // Handle empty or invalid keypress values
      if (!keyValue || keyValue.trim() === '') {
        // If empty value and step mentions "check", convert to check action
        const stepLower = (gherkinStep || '').toLowerCase();
        if (stepLower.includes('check') || stepLower.includes('select')) {
          console.warn(`⚠️  keypress action received empty value for checkbox operation - converting to check action`);
          annotationDescription = `→ Checking ${elementDescription} to select the option`;
          addAnnotation(testInfo, gherkinStep, annotationDescription);
          await targetElement.check();
        } else {
          throw new Error(`keypress action requires a valid key value, but received empty string. Use 'check' for checkboxes, 'fill' for text input, etc.`);
        }
      } else if (keyValue.length > 1 && !validSingleKeys.includes(keyValue)) {
        // If it's not a valid single key and looks like text, use fill instead
        console.warn(`⚠️  keypress action received text "${keyValue}" - converting to fill action`);
        annotationDescription = `→ Filling ${elementDescription} with value "${keyValue}"`;
        addAnnotation(testInfo, gherkinStep, annotationDescription);
        await targetElement.fill(keyValue);
      } else {
        annotationDescription = `→ Pressing key "${keyValue}" on the keyboard`;
        addAnnotation(testInfo, gherkinStep, annotationDescription);
        await page.keyboard.press(keyValue);
      }
      break;
    case 'type':
      annotationDescription = `→ Typing "${formActionResult.params.value}" using keyboard input`;
      addAnnotation(testInfo, gherkinStep, annotationDescription);
      await page.keyboard.type(formActionResult.params.value);
      break;
    case 'fill':
      annotationDescription = `→ Filling ${elementDescription} with value "${formActionResult.params.value}"`;
      addAnnotation(testInfo, gherkinStep, annotationDescription);
      await targetElement.fill(formActionResult.params.value);
      break;
    case 'select':
      annotationDescription = `→ Selecting option "${formActionResult.params.value}" from ${elementDescription}`;
      addAnnotation(testInfo, gherkinStep, annotationDescription);
      await targetElement.selectOption(formActionResult.params.value);
      break;
    case 'uncheck':
      annotationDescription = `→ Unchecking ${elementDescription} to deselect the option`;
      addAnnotation(testInfo, gherkinStep, annotationDescription);
      await targetElement.uncheck();
      break;
    case 'check':
      annotationDescription = `→ Checking ${elementDescription} to select the option`;
      addAnnotation(testInfo, gherkinStep, annotationDescription);
      await targetElement.check();
      break;
    case 'setInputFiles':
      annotationDescription = `→ Uploading file "${formActionResult.params.value}" to ${elementDescription}`;
      addAnnotation(testInfo, gherkinStep, annotationDescription);
      await targetElement.setInputFiles(formActionResult.params.value);
      break;
    case 'clear':
      annotationDescription = `→ Clearing the contents of ${elementDescription}`;
      addAnnotation(testInfo, gherkinStep, annotationDescription);
      await targetElement.clear();
      break;
    default:
      throw new Error(`Unknown form action type: ${formActionResult.type}`);
  }
  
  // Return action result and selector for snapshot storage
  return { actionResult: formActionResult, selector };
}