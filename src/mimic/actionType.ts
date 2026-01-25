import { type LanguageModel, generateText, Output } from 'ai'
import { z } from 'zod'
import { Page } from '@playwright/test'

import {
  zGeneralActionPlan, 
} from './schema/action.js'
import { countTokens } from '@utils/token-counter.js';
import type { TestContext } from '@/mimic.js';



export const getBaseAction = async (
  _page: Page, 
  brain: LanguageModel, 
  action: string,
  testContext?: TestContext,
  testCaseName?: string
): Promise<z.infer<typeof zGeneralActionPlan>> => {
  // Build context description for the prompt
  const contextDescription = testContext ? `
**Test Context:**
- Current URL: ${testContext.currentState.url}
- Current Page Title: ${testContext.currentState.pageTitle}
- Step ${testContext.currentStepIndex + 1} of ${testContext.totalSteps}
${testContext.allSteps && testContext.allSteps.length > 0 ? `
**Full Test Steps (for context):**
${testContext.allSteps.map((step, idx) => {
  const isCurrent = idx === testContext.currentStepIndex;
  const isPrevious = idx < testContext.currentStepIndex;
  const marker = isCurrent ? '→' : isPrevious ? '✓' : '○';
  return `${marker} Step ${idx + 1}: "${step}"`;
}).join('\n')}
` : ''}
${testContext.previousSteps.length > 0 ? `
**Previous Steps Executed (with action types):**
${testContext.previousSteps.map((prevStep, idx) => 
  `${idx + 1}. Step ${prevStep.stepIndex + 1}: "${prevStep.stepText}" (${prevStep.actionKind}${prevStep.url ? ` → ${prevStep.url}` : ''})`
).join('\n')}
` : ''}
` : '';

  const res = await generateText({
    model: brain,
    prompt: `You are an expert in interpreting Gherkin steps and classifying them into base user action types for automated testing using Playwright.

**CRITICAL CLASSIFICATION RULES:**

1. **Form Update Actions** - Use when the step describes MODIFYING or SETTING a value:
   - "type X into Y" → Form update (typing text into an input field)
   - "fill X with Y" → Form update (filling a field)
   - "select X from Y" → Form update (selecting from dropdown)
   - "check X" or "uncheck X" → Form update (changing checkbox state)
   - "set X to Y" → Form update (setting a value)
   - These are ACTIONS that CHANGE the state of form elements

2. **Assertion Actions** - Use when the step describes VERIFYING or CHECKING a value:
   - "verify that X is Y" → Assertion (verifying state)
   - "assert that X contains Y" → Assertion (checking content)
   - "should see X" → Assertion (verifying visibility)
   - "X should be Y" → Assertion (verifying state)
   - These are VERIFICATIONS that CHECK the current state without changing it

3. **Click Actions** - Use when the step describes CLICKING on an element:
   - "click on X" → Click (primary/left click - the default)
   - "left click on X" → Click (primary click)
   - "right click on X" → Click (secondary click - still a click action!)
   - "middle click on X" → Click (tertiary click - still a click action!)
   - "double click on X" → Click (double click - still a click action!)
   - "click X button" → Click (primary click)
   - "press X button" → Click (primary click)
   - "tap on X" → Click (primary click, mobile terminology)
   - ALL click variations (left, right, middle, double) are "Click" category
   - The specific click type (primary/secondary/tertiary/double) is determined later, not in classification

4. **Hover Actions** - Use ONLY when the step EXPLICITLY mentions hovering:
   - "hover over X" → Hover (moving mouse over element)
   - "hover on X" → Hover (moving mouse over element)
   - "move mouse over X" → Hover (moving mouse over element)
   - "mouse over X" → Hover (moving mouse over element)
   - Hover is ONLY for revealing tooltips, dropdowns, or UI elements that appear on mouseover
   - NEVER classify "click" as "hover" - these are DIFFERENT actions
   - If step says "click", it means click, NOT hover

5. **Critical Click vs Hover Distinction:**
   - "click on the button" → Click (action category)
   - "hover over the button" → Hover (action category)
   - "click" and "hover" are MUTUALLY EXCLUSIVE - choose based on what the step explicitly says
   - Default assumption: if step says "click", it's Click, NOT Hover
   - Only use Hover when step explicitly uses words like "hover", "move mouse over", etc.

6. **Key Distinction (Form vs Assertion):**
   - "type 'John' into the name field" → Form update (ACTION: typing text)
   - "verify the name field contains 'John'" → Assertion (VERIFICATION: checking text)
   - "the name field should contain 'John'" → Assertion (VERIFICATION: checking text)
   
   The word "type" or "fill" indicates an ACTION, not a verification.

7. **Context Matters:**
   - Look at the full test steps to understand the pattern
   - If previous steps show a form-filling sequence, "type X into Y" is likely a form update
   - If the step is checking a result after actions, it's likely an assertion
   - If previous steps show clicking patterns, "click" is likely a click action

For each Gherkin step, output the following:

Decision: One of the following categories:
- **Form update**: Modifying input fields, selecting options, checking boxes, etc.
- **Navigation**: Moving between pages or URLs, or using "back"/"forward".
- **Assertion**: Verifying an element's presence, state, or content.
- **Click**: Clicking on buttons, links, or other interactive elements (includes left click, right click, middle click, double click - all are "Click" category)
- **Hover**: Hovering over elements to trigger UI events or tooltips (ONLY when step explicitly says "hover" or "move mouse over")
- **Unknown**: Step is too ambiguous to confidently classify.

**Important**: All click variations (left, right, middle, double) belong to the "Click" category. The specific click type is determined later in the workflow, not during this classification step.

Explanation: Describe the reasoning behind the classification based on the literal intent of the Gherkin step. Do not infer outcomes — classify strictly based on what the step says is being done.

${contextDescription}
**Input Gherkin step:** ${action}
    
    `,
    output: Output.object({ schema: zGeneralActionPlan, name: 'generalActionPlan' }),
  });
  await countTokens(res, testCaseName);

  return res.output;
};
