import { type LanguageModel, generateText, Output } from 'ai'
import { z } from 'zod'
import { Page } from '@playwright/test'

import {
  zGeneralActionPlan, 
} from './schema/action.js'
import { countTokens } from '../utils/token-counter.js';



export const getBaseAction = async (
  _page: Page, 
  brain: LanguageModel, 
  action: string
): Promise<z.infer<typeof zGeneralActionPlan>> => {
  const res = await generateText({
    model: brain,
    prompt: `You are an expert in interpreting Gherkin steps and classifying them into base user action types for automated testing using Playwright.

For each Gherkin step, output the following:

Decision: One of the following categories:
Form update: Modifying input fields, selecting options, checking boxes, etc.
Navigation: Moving between pages or URLs, or using "back"/"forward".
Assertion: Verifying an element's presence, state, or content.
Click: Clicking on buttons, links, or other interactive elements.
Hover: Hovering over elements to trigger UI events or tooltips.
Unknown: Step is too ambiguous to confidently classify.

Explanation: Describe the reasoning behind the classification based on the literal intent of the Gherkin step. Do not infer outcomes — classify strictly based on what the step says is being done.
Format:
Classification: <one of the 6 categories>
Reason: <brief explanation of how you arrived at the classification>

Input Gherkin step:: ${action}
    
    `,
    output: Output.object({ schema: zGeneralActionPlan, name: 'generalActionPlan' }),
  });
  await countTokens(res);

  return res.output;
};
