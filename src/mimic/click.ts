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
 * @param _page - Playwright Page object (currently unused but kept for consistency)
 * @param brain - LanguageModel instance for AI analysis
 * @param gherkinStep - The Gherkin step to match (e.g., "I click on the Submit button")
 * @param targetElements - Array of captured target elements from the page
 * @returns Promise resolving to ClickActionResult with top candidates and click type
 */
export const getClickAction = async (
  _page: Page,
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

  // Create prompt that explains the task and includes all element information
  const elementsDescription = elementsWithIndices
    .map(
      (el) => `
Index: ${el.index}
Tag: ${el.tag}
Text: "${el.text}"
ID: ${el.id || 'null'}
Role: ${el.role || 'null'}
Label: ${el.label || 'null'}
Aria Label: ${el.ariaLabel || 'null'}
Type: ${el.typeAttr || 'null'}
Name: ${el.nameAttr || 'null'}
Href: ${el.href || 'null'}
Data Attributes: ${Object.keys(el.dataset).length > 0 ? JSON.stringify(el.dataset) : 'none'}
Nth of Type: ${el.nthOfType}`
    )
    .join('\n---\n');

  const prompt = `You are an expert in matching Gherkin test steps to web page elements for automated testing.

Your task is to analyze a Gherkin step and match it against all available target elements on the page. You must:

1. Understand the intent of the Gherkin step
2. Compare it against all provided target elements
3. Rank and select the top 5 most likely candidate elements
4. Determine the appropriate click type based on the Gherkin step

**Important Rules:**
- Each candidate MUST include its original array index (0-based) to reference back to the TargetInfo array
- Return up to 5 candidates, ranked by likelihood (most likely first)
- All candidates share the same click type, determined from the Gherkin step
- Click types: "left" (default), "right", "double", "middle", or "hover"
- Look for keywords in the Gherkin step like "right click", "double click", "hover over", etc.
- Consider element text, labels, ARIA attributes, and semantic meaning when matching
- Provide confidence scores (0-1) for each candidate if possible

**Gherkin Step:**
${gherkinStep}

**Available Target Elements (${targetElements.length} total):**
${elementsDescription}

Analyze the Gherkin step and return the top 5 most likely candidate elements with their indices, along with the appropriate click type and your reasoning.`;

  const res = await generateText({
    model: brain,
    prompt,
    output: Output.object({ schema: zClickActionResult, name: 'clickActionResult' }),
  });

  return res.output;
};
