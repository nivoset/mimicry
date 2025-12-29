import { type LanguageModel, generateText, Output } from 'ai'
import { Page } from '@playwright/test'

import {
  zClickActionResult,
  type ClickActionResult
} from './schema/action.js'
import type { TargetInfo } from './selector.js'

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
 * @returns Promise resolving to ClickActionResult with top candidates and click type
 */
export const getClickAction = async (
  page: Page,
  brain: LanguageModel,
  gherkinStep: string,
  targetElements: TargetInfo[]
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


**Gherkin Step:**
${gherkinStep}

**Available Target Elements (${targetElements.length} total):**
${elementsDescription}


## Reason and return up to the top 5 most likely elements that the Gherkin step is referring to.
`;
// console.log('Prompt: \n', prompt);

  const res = await generateText({
    model: brain,
    prompt,
    output: Output.object({ schema: zClickActionResult, name: 'clickActionResult' }),
  });
  console.log('Response: \n', res.output);
  

  return res.output;
};
