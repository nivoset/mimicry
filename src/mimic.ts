/**
 * Minimal flow example function
 */

import { Page, TestInfo, test } from '@playwright/test';
import type { LanguageModel } from 'ai';
import { dirname } from 'path';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getBaseAction } from './mimic/actionType.js';
import { getNavigationAction,  executeNavigationAction } from './mimic/navigation.js';
import { buildSelectorForTarget, captureTargets, type TargetInfo } from './mimic/selector.js';
import { executeClickAction, getClickAction } from './mimic/click.js';
import { getFormAction, executeFormAction, type FormActionResult } from './mimic/forms.js';
import { startTestCase, countTokens } from './utils/token-counter.js';
import { hashTestText, getSnapshot, saveSnapshot, recordFailure, shouldUseSnapshot } from './mimic/storage.js';
import { replayFromSnapshot } from './mimic/replay.js';
import { isTroubleshootMode } from './mimic/cli.js';
import { addAnnotation } from './mimic/annotations.js';
import type { StepExecutionResult } from './mimic/types.js';


export type Mimic = (steps: TemplateStringsArray, ...args: unknown[]) => Promise<void>;

/**
 * Schema for intent accomplishment check result
 * 
 * Note: All fields must be required (no .optional()) for AI SDK structured output compatibility.
 * Use empty string for remainingActions when accomplished is true.
 */
const zIntentAccomplished = z.object({
  accomplished: z.boolean().describe('Whether the step intent has been fully accomplished'),
  reasoning: z.string().describe('Brief explanation of why the intent is or is not accomplished'),
  remainingActions: z.string().describe('What actions might still be needed if not accomplished (provide empty string "" if accomplished is true)'),
});

/**
 * Check if a step's intent has been accomplished
 * 
 * Uses the LLM to analyze the current page state and determine if the step's
 * intent has been fully fulfilled. This allows the system to continue
 * executing actions for a single step until the intent is complete.
 * 
 * @param page - Playwright Page object
 * @param brain - Language model for intent analysis
 * @param stepText - The original step text to check intent for
 * @param actionsTaken - Array of actions already taken for this step
 * @returns Promise resolving to whether the intent is accomplished
 */
/**
 * Check if a step's intent has been accomplished
 * 
 * Uses the LLM to analyze the current page state and determine if the step's
 * intent has been fully fulfilled. This allows the system to continue
 * executing actions for a single step until the intent is complete.
 * 
 * @param page - Playwright Page object
 * @param brain - Language model for intent analysis
 * @param stepText - The original step text to check intent for
 * @param actionsTaken - Array of actions already taken for this step
 * @returns Promise resolving to whether the intent is accomplished
 */
async function checkIntentAccomplished(
  page: Page,
  brain: LanguageModel,
  stepText: string,
  actionsTaken: StepExecutionResult[]
): Promise<boolean> {
  try {
    // Capture current page state
    const currentUrl = page.url();
    const pageTitle = await page.title();
    const pageContent = await page.textContent('body') || '';
    const pageContentPreview = pageContent.substring(0, 2000); // Limit content size
    
    // Build description of actions taken
    const actionsDescription = actionsTaken.length > 0
      ? actionsTaken.map((action, idx) => 
          `${idx + 1}. ${action.actionKind}: ${action.stepText}`
        ).join('\n')
      : 'No actions taken yet';
    
    const prompt = `You are analyzing whether a test step's intent has been fully accomplished.

**Step Intent:**
${stepText}

**Actions Taken So Far:**
${actionsDescription}

**Current Page State:**
- URL: ${currentUrl}
- Page Title: ${pageTitle}
- Page Content Preview: ${pageContentPreview.substring(0, 500)}...

**Instructions:**
Analyze whether the step's intent has been FULLY accomplished based on:
1. The literal meaning of the step text
2. The actions that have been taken
3. The current state of the page

Consider:
- Has the step's primary goal been achieved?
- Are there any remaining sub-tasks implied by the step?
- Would a reasonable person reading the step consider it complete?

Be strict: only mark as accomplished if the intent is FULLY satisfied. If the step requires multiple actions (e.g., "fill in the form and submit it"), it's not accomplished until ALL parts are done.

**Important:** Always provide all fields:
- If accomplished is true, set remainingActions to an empty string ""
- If accomplished is false, describe what actions are still needed in remainingActions`;

    const result = await generateText({
      model: brain,
      prompt,
      output: Output.object({ schema: zIntentAccomplished, name: 'intentAccomplished' }),
    });
    
    await countTokens(result);
    
    const output = result.output;
    
    if (!output.accomplished && output.remainingActions && output.remainingActions.trim()) {
      console.log(`→ Step intent not yet accomplished. ${output.reasoning}`);
      console.log(`→ Remaining: ${output.remainingActions}`);
    } else if (output.accomplished) {
      console.log(`✓ Step intent accomplished: ${output.reasoning}`);
    }
    
    return output.accomplished;
  } catch (error) {
    // If intent check fails, default to false (continue trying)
    console.warn(`Failed to check intent accomplishment: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}


/**
 * Minimal flow function that takes a Playwright page and input string
 * 
 * @param page - Playwright Page object
 * @param input - Input string to process
 * @param testFilePath - Directory path of the test file (for snapshot storage)
 * @param troubleshootMode - Whether troubleshoot mode is enabled
 * @returns Flow execution result with validated context
 */
export async function mimic(input: string, { page, brains, testInfo, testFilePath, troubleshootMode }: {
  page: Page,
  brains: LanguageModel,
  testInfo: TestInfo | undefined,
  testFilePath?: string,
  troubleshootMode?: boolean,
}) {

  if (testInfo?.title) await startTestCase(testInfo.title);

  // Generate test hash for snapshot identification
  const testHash = hashTestText(input);
  const isTroubleshoot = troubleshootMode ?? isTroubleshootMode();

  // Normal execution with LLM - track steps for snapshot creation
  const steps = input.split('\n')
    // lets clean up things
    .map(step => step.trim())
    // and remove empty steps
    .filter((step): step is string => step.length > 0);

  const expectedStepCount = steps.length;

  // Check if we should use an existing snapshot
  // Even in troubleshoot mode, try to use snapshot first - only regenerate on failure
  const useSnapshot = testFilePath && await shouldUseSnapshot(testFilePath, testHash, isTroubleshoot, expectedStepCount);
  
  if (useSnapshot) {
    const snapshot = await getSnapshot(testFilePath!, testHash);
    if (snapshot) {
      // Add annotation indicating we're loading from snapshot
      addAnnotation(
        testInfo,
        'snapshot-load',
        `📦 Loading test from mimic snapshot file (${snapshot.steps.length} step${snapshot.steps.length !== 1 ? 's' : ''} cached)`
      );
      
      try {
        // Replay from snapshot (skip LLM calls for faster execution)
        await replayFromSnapshot(page, snapshot, testInfo);
        // If replay succeeds, we're done
        return;
      } catch (error) {
        // Replay failed - regenerate actions
        // Add annotation at the top indicating test is being updated
        addAnnotation(
          testInfo,
          'test-update',
          `🔄 Test snapshot replay failed, regenerating actions: ${error instanceof Error ? error.message : String(error)}`
        );
        
        // Record the failure before regenerating
        if (testFilePath) {
          await recordFailure(
            testFilePath,
            testHash,
            undefined,
            undefined,
            error instanceof Error ? error.message : String(error)
          );
        }
        
        // Fall through to regenerate actions below
      }
    }
  } else if (testFilePath) {
    // No snapshot exists or snapshot shouldn't be used - check if we're updating
    const existingSnapshot = await getSnapshot(testFilePath, testHash);
    if (existingSnapshot && existingSnapshot.lastFailedAt) {
      // We have a failed snapshot - add annotation that we're regenerating
      addAnnotation(
        testInfo,
        'test-update',
        '🔄 Regenerating test actions due to previous failure'
      );
    }
  }

  // executedSteps will be populated during step execution below
  const executedSteps: StepExecutionResult[] = [];

  // now lets process each step
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    
    // Type guard: ensure step is defined (should always be true after filter)
    if (!step) {
      continue;
    }
    
    try {
      await test.step(step, async () => {
        // Track all actions taken for this step
        const stepActions: StepExecutionResult[] = [];
        const maxActionsPerStep = 10; // Prevent infinite loops
        let actionCount = 0;
        let intentAccomplished = false;
        
        // Loop until intent is accomplished or max actions reached
        while (!intentAccomplished && actionCount < maxActionsPerStep) {
          actionCount++;
          
          // Check if intent is already accomplished (skip check on first action)
          if (actionCount > 1) {
            intentAccomplished = await checkIntentAccomplished(page, brains, step, stepActions);
            if (intentAccomplished) {
              console.log(`✓ Step intent accomplished after ${actionCount - 1} action(s)`);
              break;
            }
            console.log(`→ Continuing to add actions for step (attempt ${actionCount})...`);
          }
          
          // Get the next action to execute for this step
          const baseAction = await getBaseAction(page, brains, step);
          
          let stepResult: StepExecutionResult;
          
          switch (baseAction.kind) {
            case 'navigation':
              // Navigation actions will log their own plain English annotations
              const navigationAction = await getNavigationAction(page, brains, step); 
              const executedNavAction = await executeNavigationAction(page, navigationAction, testInfo, step);
              
              stepResult = {
                stepIndex,
                stepText: step,
                actionKind: 'navigation',
                actionDetails: executedNavAction,
              };
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
              const targetElement = targetElements[selectedCandidate.index];
              if (!targetElement) {
                throw new Error(`Target element not found at index ${selectedCandidate.index}`);
              }
              const clickable = await buildSelectorForTarget(page, targetElement);
              const clickResult = await executeClickAction(clickable, clickActionResult, selectedCandidate, testInfo, step);
              
              // Build targetElement with optional selector
              // Use Object.assign to preserve all required TargetInfo properties
              const targetElementWithSelector: TargetInfo & { selector?: string } = clickResult.selector
                ? Object.assign({}, targetElement, { selector: clickResult.selector })
                : (targetElement as TargetInfo);
              
              stepResult = {
                stepIndex,
                stepText: step,
                actionKind: 'click',
                actionDetails: clickResult.actionResult,
                targetElement: targetElementWithSelector,
              };
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
                const formResult = await executeFormAction(page, formActionResult, targetFormElement, testInfo, step);
                
                // Handle the return type - executeFormAction may return void | string[] or { actionResult, selector }
                let selector: string | undefined = undefined;
                let actionDetails: FormActionResult = formActionResult;
                
                if (formResult && typeof formResult === 'object' && 'actionResult' in formResult) {
                  actionDetails = (formResult as any).actionResult;
                  const resultSelector = (formResult as any).selector;
                  if (resultSelector) {
                    selector = resultSelector;
                  }
                }
                
                stepResult = {
                  stepIndex,
                  stepText: step,
                  actionKind: 'form update',
                  actionDetails,
                  targetElement: selector
                    ? { ...formElement, selector }
                    : formElement,
                };
              } else {
                console.warn(`→ No form element found for step: ${step}`);
                // Create a step result without target element
                stepResult = {
                  stepIndex,
                  stepText: step,
                  actionKind: 'form update',
                  actionDetails: formActionResult,
                };
              }
              break;
              
            default:
              throw new Error(`Unknown base action type: ${baseAction.kind}`);
          }
          
          // Add this action to the step's actions
          stepActions.push(stepResult);
          
          // After executing an action, check if intent is accomplished
          // (but skip if we just checked before this action)
          if (actionCount === 1 || actionCount >= maxActionsPerStep) {
            intentAccomplished = await checkIntentAccomplished(page, brains, step, stepActions);
          }
        }
        
        // Add all actions for this step to executedSteps
        // Each action represents a sub-action taken to accomplish the step
        executedSteps.push(...stepActions);
        
        if (actionCount >= maxActionsPerStep && !intentAccomplished) {
          console.warn(`⚠️  Reached maximum actions (${maxActionsPerStep}) for step: ${step}. Intent may not be fully accomplished.`);
        }
      });
    } catch (error) {
      // Record failure and rethrow with step information
      if (testFilePath) {
        await recordFailure(
          testFilePath,
          testHash,
          stepIndex,
          step,
          error instanceof Error ? error.message : String(error)
        );
      }
      
      throw new Error(
        `Step ${stepIndex + 1} failed: ${step}\n${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Save snapshot on successful completion
  // Only save if we executed at least as many steps as input lines
  if (testFilePath && executedSteps.length > 0) {
    // Count unique steps executed (by stepIndex)
    const uniqueStepIndices = new Set(executedSteps.map(step => step.stepIndex));
    const executedStepCount = uniqueStepIndices.size;
    
    // Only save if we have at least as many steps as input lines
    if (executedStepCount >= expectedStepCount) {
      // Check if this was a regeneration (snapshot existed but we regenerated)
      const existingSnapshot = await getSnapshot(testFilePath, testHash);
      const wasRegeneration = existingSnapshot !== null;
      
      await saveSnapshot(testFilePath, {
        testHash,
        testText: input,
        createdAt: existingSnapshot?.createdAt || new Date().toISOString(),
        lastPassedAt: new Date().toISOString(),
        lastFailedAt: null,
        steps: executedSteps.map(step => ({
          ...step,
          executedAt: new Date().toISOString(),
        })),
      });
      
      // Add annotation if this was a regeneration
      if (wasRegeneration) {
        addAnnotation(
          testInfo,
          'test-update',
          '✅ Test actions successfully regenerated and saved'
        );
      }
    } else {
      // Not all steps were executed - don't save incomplete snapshot
      console.warn(`⚠️  Not saving snapshot: only ${executedStepCount} of ${expectedStepCount} steps executed`);
    }
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
  // Extract test file path from TestInfo if available
  const testFilePath = config.testInfo?.file 
    ? dirname(config.testInfo.file) 
    : undefined;
  
  // Check troubleshoot mode
  const troubleshootMode = isTroubleshootMode();
  
  return async (prompt: TemplateStringsArray, ...args: unknown[]) => {
    const lines = trimTemplate(prompt, ...args);
    return await mimic(lines, {
      page: config.page,
      brains: config.brains,
      testInfo: config.testInfo,
      ...(testFilePath ? { testFilePath } : {}),
      troubleshootMode,
    });
  }
}
