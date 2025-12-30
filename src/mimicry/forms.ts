import { Locator, Page } from '@playwright/test';
import { type LanguageModel, generateText, Output } from 'ai'
import z from 'zod';
import { countTokens } from '../utils/token-counter';
import { TargetInfo } from './selector';

const zFormActionResult = z.object({
  type: z.enum(['keypress', 'type', 'fill', 'select', 'uncheck', 'check', 'setInputFiles', 'clear']),
  params: z.object({
    value: z.string().describe("Value to set for the form update."),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift', 'none'])).describe("Optional modifier keys to use for the form update."),
  }),
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
    prompt: `You are an expert Playwright test engineer specializing in mapping Gherkin steps to concrete DOM interactions.

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


**Gherkin Step:**
${gherkinStep}

**Available Target Elements (${targetElements.length} total):**
${elementsDescription}


## Reason and return up to the top 5 most likely elements that the Gherkin step is referring to.
`,
    output: Output.object({ schema: zFormActionResult, name: 'formActionResult' }),
    maxRetries: 3,
  });
  await countTokens(res);
  return res.output;
}


export const executeFormAction = async (
  page: Page,
  formActionResult: FormActionResult,
  targetElement: Locator | null
): Promise<void | string[]> => {
  if (targetElement === null) {
    throw new Error('No target element found');
  }
  switch (formActionResult.type) {
    case 'keypress':
      return await page.keyboard.press(formActionResult.params.value);
    case 'type':
      return await page.keyboard.type(formActionResult.params.value);
    case 'fill':
      return await targetElement.fill(formActionResult.params.value);
    case 'select':
      return await targetElement.selectOption(formActionResult.params.value);
    case 'uncheck':
      return await targetElement.uncheck();
    case 'check':
      return await targetElement.check();
    case 'setInputFiles':
      return await targetElement.setInputFiles(formActionResult.params.value);
    case 'clear':
      return await targetElement.clear();
    default:
      throw new Error(`Unknown form action type: ${formActionResult.type}`);
  }
}