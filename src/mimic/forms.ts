import { Locator, Page, TestInfo } from '@playwright/test';
import { type LanguageModel, generateText, Output } from 'ai'
import z from 'zod';
import { countTokens } from '../utils/token-counter';
import { TargetInfo } from './selector';
import { addAnnotation } from './annotations.js';

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
  targetElements: TargetInfo[]
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

  const res = await generateText({
    model: brain,
    prompt: `You are an expert Playwright test engineer specializing in mapping Gherkin steps to form interactions.

Your task is to analyze:
1. A single Gherkin step that implies a form update action (typing, filling, selecting, checking, etc.).
2. A list of candidate form elements extracted from the page.

You must determine:
- The type of form action (fill, type, select, check, uncheck, clear, etc.)
- The value to use (text to type, option to select, etc.)

**Gherkin Step:**
${gherkinStep}

**Available Form Elements (${targetElements.length} total):**
${elementsDescription}

**Action Types:**
- fill: Replace all content in a field
- type: Type text character by character
- select: Select an option from dropdown/select
- check: Check a checkbox
- uncheck: Uncheck a checkbox
- clear: Clear field content
- keypress: Press a specific key
- setInputFiles: Upload a file

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
      annotationDescription = `→ Pressing key "${formActionResult.params.value}" on the keyboard`;
      addAnnotation(testInfo, gherkinStep, annotationDescription);
      await page.keyboard.press(formActionResult.params.value);
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