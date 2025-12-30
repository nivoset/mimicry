/**
 * Minimal flow example function
 */

import { Page, TestInfo, test } from '@playwright/test';
import type { LanguageModel } from 'ai';
import { getBaseAction } from './mimicry/actionType.js';
import { getNavigationAction,  executeNavigationAction } from './mimicry/navigation.js';
import { buildSelectorForTarget, captureTargets } from './mimicry/selector.js';
import { executeClickAction, getClickAction } from './mimicry/click.js';
import { startTestCase } from './utils/token-counter.js';


export type Mimicry = (steps: TemplateStringsArray, ...args: unknown[]) => Promise<void>;


/**
 * Minimal flow function that takes a Playwright page and input string
 * 
 * @param page - Playwright Page object
 * @param input - Input string to process
 * @returns Flow execution result with validated context
 */
export async function mimicry(input: string, { page, brains, testInfo }: {
  page: Page,
  brains: LanguageModel,
  testInfo?: TestInfo,
}) {

  if (testInfo?.title) await startTestCase(testInfo.title);

  const steps = input.split('\n')
    // lets clean up things
    .map(step => step.trim())
    // and remove empty steps
    .filter(step => step.length > 0);

  // now lets process each step
  for (const step of steps) {
    await test.step(step, async () => {
      const baseAction = await getBaseAction(page, brains, step);
      switch (baseAction.kind) {
        case 'navigation':
          console.log(`Navigating to ${step}`);
          const navigationAction = await getNavigationAction(page, brains, step); 
          await executeNavigationAction(page, navigationAction);
          break;
        case 'click':
          console.log(`Clicking on ${step}`);
          const targetElements = await captureTargets(page, { interactableOnly: true });
          const clickActionResult = await getClickAction(page, brains, step, targetElements);
          // TODO: better way to work out if the top priority candidate is a clickable element
          const clickable = await buildSelectorForTarget(page, clickActionResult.candidates.find(Boolean) as any);
          await executeClickAction(clickable, clickActionResult);
          
          break;
        case 'form update':
          const formElements = await captureTargets(page, { interactableOnly: true });
          console.log(`Form element count: ${formElements.length}`);
          break;
        default:

          throw new Error(`Unknown base action type: ${baseAction.kind}`);
      }
    });
  }
 
}
function trimTemplate(strings: TemplateStringsArray, ...values: any[]): string {
  // Combine the template string with interpolated values
  let result = strings.reduce((acc, str, i) => {
    return acc + str + (values[i] ?? '');
  }, '');

  // Split into lines, trim each, filter out empty lines, and join back
  return result
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

export const createMimicry = (config: {
  page: Page,
  brains: LanguageModel,
  testInfo?: TestInfo,
}) => {
  return async (prompt: TemplateStringsArray, ...args: unknown[]) => {
    const lines = trimTemplate(prompt, ...args);
    return await mimicry(lines, config);
  }
}