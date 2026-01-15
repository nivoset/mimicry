import { type LanguageModel, generateText, Output } from 'ai'
import { z } from 'zod'
import { Page } from '@playwright/test'

import {
  zGeneralActionPlan, 
} from './schema/action.js'
import { countTokens } from '../utils/token-counter.js';
import type { TestContext } from '../mimic.js';
import { generateAriaSnapshot } from './markers.js';



export const getBaseAction = async (
  page: Page, 
  brain: LanguageModel, 
  action: string,
  testContext?: TestContext,
  testCaseName?: string
): Promise<z.infer<typeof zGeneralActionPlan>> => {
  // Generate accessibility snapshot to understand available interactive elements
  console.log('🔍 [getBaseAction] Generating accessibility snapshot...');
  const ariaSnapshotStart = Date.now();
  const ariaSnapshot = await generateAriaSnapshot(page).catch(() => '');
  const ariaSnapshotTime = Date.now() - ariaSnapshotStart;
  console.log(`🔍 [getBaseAction] Accessibility snapshot generated in ${ariaSnapshotTime}ms (${(ariaSnapshotTime / 1000).toFixed(2)}s), length: ${ariaSnapshot.length} chars`);

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

  const ariaSnapshotSection = ariaSnapshot ? `
**Accessibility Snapshot (available interactive elements on the page):**
The following accessibility snapshot describes the page structure with roles, accessible names, data-testid attributes, and data-mimic-* attributes. Use this to understand what interactive elements are available on the page:
\`\`\`
${ariaSnapshot}
\`\`\`
` : '';

  const res = await generateText({
    model: brain,
    prompt: `You are an expert in interpreting Gherkin steps and classifying them into base user action types for automated testing using Playwright.

For each Gherkin step, output the following:

Decision: One of the following categories:
Form update: Modifying input fields, selecting options, checking boxes, etc.
Navigation: Moving between pages or URLs, or using browser navigation (back/forward/refresh) when NO interactive element exists for it.
Assertion: Verifying an element's presence, state, or content.
Click: Clicking on buttons, links, or other interactive elements.
Hover: Hovering over elements to trigger UI events or tooltips.
Unknown: Step is too ambiguous to confidently classify.

**CRITICAL: Prefer Interactions Over Navigation**
- **ALWAYS prefer Click over Navigation** when an interactive element exists on the page
- For "go back", "back", "previous", "return": First check if there's a back button (arrow left, "Back" button, etc.) in the accessibility snapshot - if found, use "Click", not "Navigation"
- For "go forward", "forward", "next": First check if there's a forward button in the accessibility snapshot - if found, use "Click", not "Navigation"
- For "refresh", "reload": First check if there's a refresh/reload button in the accessibility snapshot - if found, use "Click", not "Navigation"
- Only use "Navigation" when:
  - Navigating to a specific URL (e.g., "navigate to https://example.com")
  - No interactive element exists for the action (e.g., no back button found for "go back")
  - The step explicitly mentions browser navigation

**Classification Priority:**
1. Check the accessibility snapshot for interactive elements that match the step
2. If an interactive element exists (button, link, etc.), prefer "Click" over "Navigation"
3. Only use "Navigation" if no matching interactive element is found

Explanation: Describe the reasoning behind the classification based on the literal intent of the Gherkin step. Do not infer outcomes — classify strictly based on what the step says is being done.
Format:
Classification: <one of the 6 categories>
Reason: <brief explanation of how you arrived at the classification>

${contextDescription}
${ariaSnapshotSection}
**Input Gherkin step:** ${action}
    
    `,
    output: Output.object({ schema: zGeneralActionPlan, name: 'generalActionPlan' }),
  });
  await countTokens(res, testCaseName);

  return res.output;
};
