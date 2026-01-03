/**
 * Minimal flow example function
 */

import { Page, TestInfo, test } from '@playwright/test';
import type { LanguageModel } from 'ai';
import { getBaseAction } from './mimic/actionType.js';
import { getNavigationAction,  executeNavigationAction } from './mimic/navigation.js';
import { buildSelectorForTarget, captureTargets } from './mimic/selector.js';
import { executeClickAction, getClickAction } from './mimic/click.js';
import { getFormAction, executeFormAction } from './mimic/forms.js';
import { startTestCase } from './utils/token-counter.js';


export type Mimic = (steps: TemplateStringsArray, ...args: unknown[]) => Promise<void>;


/**
 * Minimal flow function that takes a Playwright page and input string
 * 
 * @param page - Playwright Page object
 * @param input - Input string to process
 * @returns Flow execution result with validated context
 */
export async function mimic(input: string, { page, brains, testInfo }: {
  page: Page,
  brains: LanguageModel,
  testInfo: TestInfo | undefined,
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
          // Navigation actions will log their own plain English annotations
          const navigationAction = await getNavigationAction(page, brains, step); 
          await executeNavigationAction(page, navigationAction);
          break;
        case 'click':
          // Click actions will log their own plain English annotations
          const targetElements = await captureTargets(page, { interactableOnly: true });
          const clickActionResult = await getClickAction(page, brains, step, targetElements);
          // TODO: better way to work out if the top priority candidate is a clickable element
          const selectedCandidate = clickActionResult.candidates.find(Boolean);
          if (!selectedCandidate) {
            throw new Error(`No candidate element found for click action: ${step}`);
          }
          const clickable = await buildSelectorForTarget(page, targetElements[selectedCandidate.index]);
          await executeClickAction(clickable, clickActionResult, selectedCandidate, testInfo, step);
          
          break;
        case 'form update':
          // Form actions will log their own plain English annotations
          const formElements = await captureTargets(page, { interactableOnly: true });
          const formActionResult = await getFormAction(page, brains, step, formElements);
          
          // Find the target form element by matching step description
          // Try to find element that matches keywords from the step (name, email, etc.)
          const stepLower = step.toLowerCase();
          let formElement = formElements.find(el => {
            // Match by label, name, id, or placeholder
            const labelMatch = el.label && stepLower.includes(el.label.toLowerCase());
            const nameMatch = el.nameAttr && stepLower.includes(el.nameAttr.toLowerCase());
            const idMatch = el.id && stepLower.includes(el.id.toLowerCase());
            const ariaLabelMatch = el.ariaLabel && stepLower.includes(el.ariaLabel.toLowerCase());
            
            // Also check if step mentions the element type (e.g., "name field", "email field")
            const fieldTypeMatch = 
              (stepLower.includes('name') && (el.nameAttr?.includes('name') || el.id?.includes('name') || el.label?.toLowerCase().includes('name'))) ||
              (stepLower.includes('email') && (el.nameAttr?.includes('email') || el.id?.includes('email') || el.label?.toLowerCase().includes('email'))) ||
              (stepLower.includes('phone') && (el.nameAttr?.includes('phone') || el.id?.includes('phone') || el.label?.toLowerCase().includes('phone'))) ||
              (stepLower.includes('message') && (el.nameAttr?.includes('message') || el.id?.includes('message') || el.label?.toLowerCase().includes('message')));
            
            return (labelMatch || nameMatch || idMatch || ariaLabelMatch || fieldTypeMatch) &&
                   (el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select');
          });
          
          // Fallback to first form element if no match found
          if (!formElement) {
            formElement = formElements.find(el => 
              el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select'
            ) || formElements[0];
          }
          
          if (formElement) {
            const targetFormElement = await buildSelectorForTarget(page, formElement);
            await executeFormAction(page, formActionResult, targetFormElement, testInfo, step);
          } else {
            console.warn(`→ No form element found for step: ${step}`);
          }
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

export const createMimic = (config: {
  page: Page,
  brains: LanguageModel,
  testInfo?: TestInfo,
}) => {
  return async (prompt: TemplateStringsArray, ...args: unknown[]) => {
    const lines = trimTemplate(prompt, ...args);
    return await mimic(lines, {
      page: config.page,
      brains: config.brains,
      testInfo: config.testInfo,
    });
  }
}
