/**
 * Minimal flow example function
 */

import { Page, TestInfo, test, type Locator } from '@playwright/test';
import type { LanguageModel } from 'ai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getBaseAction } from '@mimic/actionType.js';
import { getNavigationAction,  executeNavigationAction } from '@mimic/navigation.js';
import { captureScreenshot, getMimic } from '@mimic/markers.js';
import type { MarkerTargetElement, SnapshotStep, Snapshot } from '@mimic/types.js';
import { executeClickAction, getClickAction } from '@mimic/click.js';
import { getFormAction, executeFormAction, type FormActionResult } from '@mimic/forms.js';
import type { NavigationAction } from '@mimic/schema/action.js';
import type { ClickActionResult } from '@mimic/schema/action.js';
import { getFromSelector } from '@mimic/selectorUtils.js';
import { generateBestSelectorForElement } from '@mimic/selector.js';
import { startTestCase, countTokens, getTestCaseTokens } from '@utils/token-counter.js';
import { hashTestText, hashStepText, getSnapshot, saveSnapshot, recordFailure, shouldUseSnapshot } from '@mimic/storage.js';
import { replayFromSnapshot } from '@mimic/replay.js';
import { isTroubleshootMode } from '@mimic/cli.js';
import { addAnnotation } from '@mimic/annotations.js';
import type { StepExecutionResult } from '@mimic/types.js';
import { getAssertionAction, executeAssertionAction, type AssertionActionResult } from '@mimic/assertions.js';
import { formatErrorWithPlaywrightCode } from '@mimic/errorFormatter.js';
import { logger } from '@mimic/logger.js';


export type Mimic = (steps: TemplateStringsArray, ...args: unknown[]) => Promise<void>;

/**
 * Test context that tracks previous state and actions for better decision-making
 */
export interface TestContext {
  /** Previous steps that have been executed */
  previousSteps: Array<{
    stepIndex: number;
    stepText: string;
    actionKind: string;
    url?: string;
    pageTitle?: string;
  }>;
  /** Current page state */
  currentState: {
    url: string;
    pageTitle: string;
  };
  /** Total number of steps in the test */
  totalSteps: number;
  /** Current step index */
  currentStepIndex: number;
}

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
  actionsTaken: StepExecutionResult[],
  testCaseName?: string
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
    
    await countTokens(result, testCaseName);
    
    const output = result.output;
    
    if (!output.accomplished && output.remainingActions && output.remainingActions.trim()) {
      logger.info({ reasoning: output.reasoning, remainingActions: output.remainingActions }, `→ Step intent not yet accomplished. ${output.reasoning}`);
      logger.info({ remainingActions: output.remainingActions }, `→ Remaining: ${output.remainingActions}`);
    } else if (output.accomplished) {
      logger.info({ reasoning: output.reasoning }, `✓ Step intent accomplished: ${output.reasoning}`);
    }
    
    return output.accomplished;
  } catch (error) {
    // If intent check fails, default to false (continue trying)
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, `Failed to check intent accomplishment: ${error instanceof Error ? error.message : String(error)}`);
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

  const testCaseName = testInfo?.title;
  if (testCaseName) await startTestCase(testCaseName);

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

  // Track whether we used a snapshot (for token usage reporting)
  let snapshotUsed = false;

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
        // If replay succeeds, we're done - log 0 tokens used
        snapshotUsed = true;
        
        // Add token usage annotation (0 tokens for snapshot replay)
        if (testCaseName && testInfo) {
          addAnnotation(
            testInfo,
            'token-usage',
            `📊 Token Usage: 0 tokens (snapshot replay - no AI calls)`
          );
        }
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
    if (existingSnapshot && existingSnapshot.flags?.lastFailedAt) {
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

  // Load existing snapshot to check for cached steps
  // This allows selective regeneration - only regenerate steps that don't exist or have changed
  let existingSnapshot: Snapshot | null = null;
  if (testFilePath) {
    existingSnapshot = await getSnapshot(testFilePath, testHash);
  }
  
  // Build a map of existing steps by their hash for quick lookup
  // This enables selective regeneration: only regenerate steps that don't exist in the snapshot
  const existingStepsByHash: Record<string, SnapshotStep> = {};
  if (existingSnapshot) {
    // Support both new format (stepsByHash) and old format (steps array) for backward compatibility
    if (existingSnapshot.stepsByHash) {
      Object.assign(existingStepsByHash, existingSnapshot.stepsByHash);
    } else if (existingSnapshot.steps) {
      // Convert old format to new format for backward compatibility
      for (const step of existingSnapshot.steps) {
        existingStepsByHash[step.stepHash] = step;
      }
    }
  }
  
  // Note: Full snapshot replay is handled above in the useSnapshot block
  // Below we handle selective regeneration: only regenerate steps that don't exist in the snapshot

  // Capture screenshot with markers at the start of test execution
  // This provides a visual reference of the initial page state with all markers
  // Attach it to the test report so it's visible in Playwright HTML reports
  try {
    logger.info('📸 [mimic] Capturing initial screenshot with markers for test attachment...');
    const { image: screenshot } = await captureScreenshot(page);
    logger.info({ screenshotSizeKB: (screenshot.length / 1024).toFixed(2) }, `📸 [mimic] Screenshot captured (${(screenshot.length / 1024).toFixed(2)}KB)`);
    
    // Attach screenshot to test report if testInfo is available
    // This makes it visible in Playwright HTML reports like a regular screenshot
    if (testInfo) {
      await testInfo.attach('initial-page-with-markers.png', {
        body: screenshot,
        contentType: 'image/png',
      });
      logger.info('📎 [mimic] Screenshot attached to test report');
    }
  } catch (error) {
    // If screenshot capture fails, log but don't fail the test
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, `⚠️  [mimic] Failed to capture initial screenshot: ${error instanceof Error ? error.message : String(error)}`);
  }

  test.slow(true);
  // now lets process each step
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    
    // Type guard: ensure step is defined (should always be true after filter)
    if (!step) {
      continue;
    }
    
    // Check if this step already exists in the snapshot
    // This enables selective regeneration: only regenerate steps that don't exist or have changed
    const stepHash = hashStepText(step);
    const existingStep = existingStepsByHash[stepHash];
    
    // If step exists in snapshot and we're not forcing full regeneration, use it for replay
    // Otherwise, regenerate the step
    // Note: Full snapshot replay (all steps) is handled above, this is for selective regeneration
    // We skip selective regeneration if we already did full replay (useSnapshot path)
    if (existingStep && existingSnapshot && !existingSnapshot.flags?.forceRegenerate && !useSnapshot) {
      // Step exists in snapshot - replay it instead of regenerating
      logger.info({ step, stepHash }, `📦 [mimic] Using cached step: "${step}" (hash: ${stepHash})`);
      try {
        await test.step(step, async () => {
          // Replay the step from snapshot
          switch (existingStep.actionKind) {
            case 'navigation':
              const navAction = existingStep.actionDetails as NavigationAction;
              await executeNavigationAction(page, navAction, testInfo, step);
              break;
            case 'click':
              const clickAction = existingStep.actionDetails as ClickActionResult;
              if (!existingStep.targetElement) {
                throw new Error(`Cached step missing targetElement`);
              }
              let clickElement;
              try {
                clickElement = getFromSelector(page, existingStep.targetElement.selector);
                await clickElement.waitFor({ timeout: 5000 });
              } catch (error) {
                if (existingStep.targetElement.mimicId !== undefined) {
                  clickElement = getMimic(page, existingStep.targetElement.mimicId);
                } else {
                  throw error;
                }
              }
              const selectedCandidate = clickAction.candidates[0];
              if (!selectedCandidate) {
                throw new Error(`Cached step has no candidates`);
              }
              await executeClickAction(clickElement, clickAction, selectedCandidate, testInfo, step);
              break;
            case 'form update':
              const formAction = existingStep.actionDetails as FormActionResult;
              if (!existingStep.targetElement) {
                throw new Error(`Cached step missing targetElement`);
              }
              let formElement;
              try {
                formElement = getFromSelector(page, existingStep.targetElement.selector);
                await formElement.waitFor({ timeout: 5000 });
              } catch (error) {
                if (existingStep.targetElement.mimicId !== undefined) {
                  formElement = getMimic(page, existingStep.targetElement.mimicId);
                } else {
                  throw error;
                }
              }
              await executeFormAction(page, formAction, formElement, testInfo, step);
              break;
            case 'assertion':
              const assertionAction = existingStep.actionDetails as AssertionActionResult;
              // Get target element if mimicId is provided (null for page-level assertions)
              let assertionElement: Locator | null = null;
              if (existingStep.targetElement) {
                try {
                  assertionElement = getFromSelector(page, existingStep.targetElement.selector);
                  await assertionElement.waitFor({ timeout: 5000 });
                } catch (error) {
                  if (existingStep.targetElement.mimicId !== undefined) {
                    assertionElement = getMimic(page, existingStep.targetElement.mimicId);
                  } else {
                    throw error;
                  }
                }
              }
              await executeAssertionAction(page, assertionAction, assertionElement, testInfo, step);
              break;
          }
          
          // Add to executed steps for snapshot
          // Mark this as a replayed step so we preserve the original executedAt
          const cachedStepResult: StepExecutionResult & { _wasReplayed?: boolean; _originalExecutedAt?: string } = {
            stepIndex,
            stepText: step,
            actionKind: existingStep.actionKind,
            actionDetails: existingStep.actionDetails,
            ...(existingStep.targetElement && { targetElement: existingStep.targetElement }),
            _wasReplayed: true,
            _originalExecutedAt: existingStep.executedAt,
          };
          executedSteps.push(cachedStepResult);
        });
        continue; // Skip to next step
      } catch (error) {
        // Replay failed - fall through to regenerate
        logger.warn({ step, stepHash, error: error instanceof Error ? error.message : String(error) }, `⚠️  [mimic] Cached step replay failed, regenerating: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Step doesn't exist in snapshot or replay failed - regenerate it
    logger.info({ step, stepHash }, `🔄 [mimic] Regenerating step: "${step}" (hash: ${stepHash})`);
    try {
      await test.step(step, async () => {
        // Build test context from previous steps and current state
        const currentUrl = page.url();
        const currentPageTitle = await page.title().catch(() => 'Unknown');
        
        const testContext: TestContext = {
          previousSteps: executedSteps.map((executedStep) => ({
            stepIndex: executedStep.stepIndex,
            stepText: executedStep.stepText,
            actionKind: executedStep.actionKind,
            // Extract URL from navigation actions if available
            url: executedStep.actionKind === 'navigation' 
              ? (executedStep.actionDetails as any).params?.url || undefined
              : undefined,
          })),
          currentState: {
            url: currentUrl,
            pageTitle: currentPageTitle,
          },
          totalSteps: steps.length,
          currentStepIndex: stepIndex,
        };
        
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
            intentAccomplished = await checkIntentAccomplished(page, brains, step, stepActions, testCaseName);
            if (intentAccomplished) {
              logger.info({ step, actionCount: actionCount - 1 }, `✓ Step intent accomplished after ${actionCount - 1} action(s)`);
              break;
            }
            logger.info({ step, actionCount }, `→ Continuing to add actions for step (attempt ${actionCount})...`);
            break;
          }
          // Get the next action to execute for this step
          const baseAction = await getBaseAction(page, brains, step, testContext, testCaseName);
          
          let stepResult: StepExecutionResult;

          // Wait a bit for markers to be applied to all elements
          // await page.waitForTimeout(500);
          
          switch (baseAction.kind) {
            case 'navigation':
              // Navigation actions will log their own plain English annotations
              const navigationAction = await getNavigationAction(page, brains, step, testContext, testCaseName); 
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
              const clickActionResult = await getClickAction(page, brains, step, testContext, testCaseName);
              
              // Defensive check: ensure candidates array exists and is valid
              if (!clickActionResult || !clickActionResult.candidates || !Array.isArray(clickActionResult.candidates)) {
                throw new Error(`Invalid click action result: candidates array is missing or invalid for step: ${step}`);
              }
              
              // TODO: better way to work out if the top priority candidate is a clickable element
              const selectedCandidate = clickActionResult.candidates.sort((a, b) => b.confidence! - a.confidence!).find(Boolean);
              if (!selectedCandidate) {
                throw new Error(`No candidate element found for click action: ${step}`);
              }
              // Use marker ID from the candidate to get the locator
              if (!selectedCandidate.mimicId) {
                throw new Error(`Selected candidate is missing mimicId for click action: ${step}`);
              }
              const clickable = getMimic(page, selectedCandidate.mimicId);
              const clickResult = await executeClickAction(clickable, clickActionResult, selectedCandidate, testInfo, step);
              
              // Store best selector descriptor with mimicId as fallback
              if (!clickResult.selector) {
                throw new Error(`Could not generate selector for click action: ${step}`);
              }
              const targetElement: MarkerTargetElement = {
                selector: clickResult.selector,
                mimicId: selectedCandidate.mimicId
              };
              
              stepResult = {
                stepIndex,
                stepText: step,
                actionKind: 'click',
                actionDetails: clickResult.actionResult,
                targetElement,
              };
              break;
              
            case 'form update':
              // Form actions will log their own plain English annotations
              const formActionResult = await getFormAction(page, brains, step, testContext, testCaseName);
              
              // Use marker ID from the form result to get the locator
              if (!formActionResult.mimicId) {
                throw new Error(`Form action result is missing mimicId for form action: ${step}`);
              }
              const targetFormElement = getMimic(page, formActionResult.mimicId);
              const formResult = await executeFormAction(page, formActionResult, targetFormElement, testInfo, step);
              
              // Handle the return type - executeFormAction returns { actionResult, selector }
              const selector = formResult.selector;
              const actionDetails = formResult.actionResult;
              
              // Store best selector descriptor with mimicId as fallback
              if (!selector) {
                throw new Error(`Could not generate selector for form action: ${step}`);
              }
              const formTargetElement: MarkerTargetElement = {
                selector,
                mimicId: formActionResult.mimicId
              };
              
              stepResult = {
                stepIndex,
                stepText: step,
                actionKind: 'form update',
                actionDetails,
                targetElement: formTargetElement,
              };
              break;
              
            case 'assertion':
              // Assertion actions will log their own plain English annotations
              const assertionActionResult = await getAssertionAction(page, brains, step, testContext, testCaseName);
              
              // Get target element if mimicId is provided (null for page-level assertions like URL/title)
              let assertionTargetElement: Locator | null = null;
              let assertionTargetMarker: MarkerTargetElement | undefined = undefined;
              
              if (assertionActionResult.mimicId !== null) {
                assertionTargetElement = getMimic(page, assertionActionResult.mimicId);
                // Generate selector for the target element
                try {
                  const assertionSelector = await generateBestSelectorForElement(assertionTargetElement);
                  assertionTargetMarker = {
                    selector: assertionSelector,
                    mimicId: assertionActionResult.mimicId
                  };
                } catch (error) {
                  logger.warn({ error: error instanceof Error ? error.message : String(error) }, `⚠️  Could not generate selector for assertion target: ${error instanceof Error ? error.message : String(error)}`);
                }
              }
              
              await executeAssertionAction(
                page,
                assertionActionResult,
                assertionTargetElement,
                testInfo,
                step
              );
              
              // Store selector if we have one (may be null for page-level assertions)
              stepResult = {
                stepIndex,
                stepText: step,
                actionKind: 'assertion',
                actionDetails: assertionActionResult,
                ...(assertionTargetMarker && { targetElement: assertionTargetMarker }),
              };
              break;
              
            default:
              throw new Error(`Unknown base action type: ${baseAction.kind}`);
          }
          
          // Add this action to the step's actions
          stepActions.push(stepResult);
          
          // After executing an action, check if intent is accomplished
          // (but skip if we just checked before this action)
          if (actionCount === 1 || actionCount >= maxActionsPerStep) {
            intentAccomplished = await checkIntentAccomplished(page, brains, step, stepActions, testCaseName);
          }
        }
        
        // Add all actions for this step to executedSteps
        // Each action represents a sub-action taken to accomplish the step
        executedSteps.push(...stepActions);
        
        if (actionCount >= maxActionsPerStep && !intentAccomplished) {
          logger.warn({ step, actionCount, maxActionsPerStep }, `⚠️  Reached maximum actions (${maxActionsPerStep}) for step: ${step}. Intent may not be fully accomplished.`);
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
      
      // If error already has Playwright code context (from MimicError), use it
      // Otherwise, format it with step information
      if (error instanceof Error && 'playwrightCode' in error) {
        // Error already has context, just rethrow it
        throw error;
      } else {
        // Format error with step context
        const formattedError = formatErrorWithPlaywrightCode(
          error,
          undefined, // No Playwright code available at this level
          undefined, // No action description at this level
          step
        );
        throw new Error(formattedError);
      }
    }
  }

  // Save snapshot on successful completion
  // Only save if we executed at least as many steps as input lines and all steps succeeded
  // (We only reach here if no errors were thrown, meaning all steps succeeded)
  if (testFilePath && executedSteps.length > 0) {
    // Count unique steps executed (by stepIndex)
    const uniqueStepIndices = new Set(executedSteps.map(step => step.stepIndex));
    const executedStepCount = uniqueStepIndices.size;
    
    // Only save if we have at least as many steps as input lines
    if (executedStepCount >= expectedStepCount) {
      // Check if this was a regeneration (snapshot existed but we regenerated)
      const existingSnapshot = await getSnapshot(testFilePath, testHash);
      const wasRegeneration = existingSnapshot !== null;
      const now = new Date().toISOString();
      
      // Hash each step text and create snapshot steps with hashes
      // Build stepsByHash map for efficient lookup and selective regeneration
      // Start with existing steps to preserve steps that weren't regenerated
      const stepsByHash: Record<string, SnapshotStep> = {};
      if (existingSnapshot) {
        // Support both new format (stepsByHash) and old format (steps array) for backward compatibility
        if (existingSnapshot.stepsByHash) {
          Object.assign(stepsByHash, existingSnapshot.stepsByHash);
        } else if (existingSnapshot.steps) {
          // Convert old format to new format
          for (const step of existingSnapshot.steps) {
            stepsByHash[step.stepHash] = step;
          }
        }
      }
      
      // Process executed steps and update/merge with existing snapshot
      // This will overwrite existing steps that were regenerated, but preserve others
      for (const step of executedSteps) {
        const stepHash = hashStepText(step.stepText);
        
        // Check if this step was replayed from cache
        // We track this via a special property on StepExecutionResult
        const wasReplayed = (step as any)._wasReplayed === true;
        const originalExecutedAt = (step as any)._originalExecutedAt;
        
        // Only set new executedAt if this step was regenerated (not replayed)
        // If replayed, preserve the original executedAt
        const executedAt = wasReplayed && originalExecutedAt ? originalExecutedAt : now;
        
        const baseStep: Omit<SnapshotStep, 'targetElement'> = {
          stepHash,
          stepIndex: step.stepIndex,
          stepText: step.stepText,
          actionKind: step.actionKind,
          actionDetails: step.actionDetails,
          executedAt,
        };
        
        // Conditionally include targetElement only if it exists
        const snapshotStep: SnapshotStep = step.targetElement
          ? { ...baseStep, targetElement: step.targetElement }
          : baseStep as SnapshotStep;
        
        // Store in stepsByHash (will overwrite if step was regenerated, or add if new)
        stepsByHash[stepHash] = snapshotStep;
      }
      
      // Build ordered steps array from stepsByHash for backward compatibility
      // Sort by stepIndex to maintain order
      const allSteps = Object.values(stepsByHash);
      allSteps.sort((a, b) => a.stepIndex - b.stepIndex);
      const snapshotSteps: SnapshotStep[] = allSteps;
      
      // Build snapshot object (screenshot is attached to test report, not stored in JSON)
      // Only update lastPassedAt if this is a new test or content changed
      // saveSnapshot will handle the comparison and only update if needed
      const snapshot: Snapshot = {
        testHash,
        testText: input,
        stepsByHash, // New format: indexed by stepHash for efficient lookup
        steps: snapshotSteps, // Backward compatibility: ordered array
        flags: {
          needsRetry: false,
          hasErrors: false,
          troubleshootingEnabled: isTroubleshoot,
          skipSnapshot: false,
          forceRegenerate: false,
          debugMode: false,
          createdAt: existingSnapshot?.flags?.createdAt || now,
          // Don't set lastPassedAt here - saveSnapshot will only update it if content changed
          lastPassedAt: existingSnapshot?.flags?.lastPassedAt || now,
          lastFailedAt: null,
        },
      };
      
      await saveSnapshot(testFilePath, snapshot);
      
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
      logger.warn({ executedStepCount, expectedStepCount }, `⚠️  Not saving snapshot: only ${executedStepCount} of ${expectedStepCount} steps executed`);
    }
  }

  // Add token usage annotation at the end of test execution
  // Only add if we didn't use a snapshot (snapshot case is handled above)
  if (!snapshotUsed && testCaseName && testInfo) {
    const tokenCounts = getTestCaseTokens(testCaseName);
    if (tokenCounts) {
      // Format token counts for display
      const tokenEntries = Object.entries(tokenCounts)
        .filter(([_, value]) => value > 0) // Only show non-zero counts
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      
      const totalTokens = Object.values(tokenCounts).reduce((sum, val) => sum + val, 0);
      
      if (tokenEntries) {
        addAnnotation(
          testInfo,
          'token-usage',
          `📊 Token Usage: ${tokenEntries} (Total: ${totalTokens} tokens)`
        );
      } else {
        addAnnotation(
          testInfo,
          'token-usage',
          `📊 Token Usage: 0 tokens`
        );
      }
    } else {
      // No tokens tracked - likely an error case
      addAnnotation(
        testInfo,
        'token-usage',
        `📊 Token Usage: 0 tokens`
      );
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
  eyes?: LanguageModel,
  testInfo?: TestInfo,
}) => {
  // Extract test file path from TestInfo if available
  // Pass full file path (not directory) to storage functions
  const testFilePath = config.testInfo?.file || undefined;

  config.eyes = config.eyes ?? config.brains;
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
