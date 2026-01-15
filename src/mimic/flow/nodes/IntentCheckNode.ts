/**
 * Intent Check Node
 * 
 * Checks if a step's intent has been accomplished.
 * Routes back to action execution if not accomplished, or to next step if accomplished.
 */

import { Node } from 'pocketflow';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { MimicSharedState } from '../types.js';
import { countTokens } from '../../../utils/token-counter.js';
import type { StepExecutionResult } from '../../../mimic.js';

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
 * Intent Check Node - Checks if step intent is accomplished
 * 
 * Responsibilities:
 * - Analyze current page state
 * - Check if step intent is fully accomplished
 * - Route to next action or next step accordingly
 */
export class IntentCheckNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read step, actions, page, and brains from shared state
   */
  async prep(shared: MimicSharedState): Promise<{
    step: string;
    stepIndex: number;
    actionsTaken: StepExecutionResult[];
    page: MimicSharedState['page'];
    brains: MimicSharedState['brains'];
    testCaseName: MimicSharedState['testCaseName'];
    actionCount: number;
    maxActionsPerStep: number;
  }> {
    const stepIndex = shared.currentStepIndex;
    const step = shared.steps[stepIndex] || '';

    return {
      step,
      stepIndex,
      actionsTaken: shared.currentStepActions,
      page: shared.page,
      brains: shared.brains,
      testCaseName: shared.testCaseName,
      actionCount: shared.actionCount,
      maxActionsPerStep: shared.maxActionsPerStep,
    };
  }

  /**
   * Execute: Check if intent is accomplished
   */
  async exec({
    step,
    actionsTaken,
    page,
    brains,
    testCaseName,
    actionCount,
    maxActionsPerStep,
  }: {
    step: string;
    stepIndex: number;
    actionsTaken: StepExecutionResult[];
    page: MimicSharedState['page'];
    brains: MimicSharedState['brains'];
    testCaseName: MimicSharedState['testCaseName'];
    actionCount: number;
    maxActionsPerStep: number;
  }): Promise<{ accomplished: boolean }> {
    // Check if we've reached max actions
    if (actionCount >= maxActionsPerStep) {
      console.warn(`⚠️  Reached maximum actions (${maxActionsPerStep}) for step: ${step}. Intent may not be fully accomplished.`);
      return { accomplished: true }; // Force move to next step
    }

    // Skip intent check on first action (we need at least one action before checking)
    if (actionCount <= 1) {
      return { accomplished: false };
    }

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
${step}

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
        model: brains,
        prompt,
        output: Output.object({ schema: zIntentAccomplished, name: 'intentAccomplished' }),
      });

      await countTokens(result, testCaseName);

      const output = result.output;

      if (!output.accomplished && output.remainingActions && output.remainingActions.trim()) {
        console.log(`→ Step intent not yet accomplished. ${output.reasoning}`);
        console.log(`→ Remaining: ${output.remainingActions}`);
      } else if (output.accomplished) {
        console.log(`✓ Step intent accomplished: ${output.reasoning}`);
      }

      return { accomplished: output.accomplished };
    } catch (error) {
      // If intent check fails, default to false (continue trying)
      console.warn(`Failed to check intent accomplishment: ${error instanceof Error ? error.message : String(error)}`);
      return { accomplished: false };
    }
  }

  /**
   * Post: Update shared state and route accordingly
   */
  async post(
    shared: MimicSharedState,
    prepRes: {
      step: string;
      stepIndex: number;
      actionsTaken: StepExecutionResult[];
      page: MimicSharedState['page'];
      brains: MimicSharedState['brains'];
      testCaseName: MimicSharedState['testCaseName'];
      actionCount: number;
      maxActionsPerStep: number;
    },
    execRes: { accomplished: boolean }
  ): Promise<string | undefined> {
    shared.intentAccomplished = execRes.accomplished;

    if (execRes.accomplished) {
      // Intent accomplished - move to next step
      console.log(`✓ Step intent accomplished after ${prepRes.actionCount} action(s)`);
      
      // Reset step-specific state
      shared.currentStepActions = [];
      shared.intentAccomplished = false;
      shared.actionCount = 0;
      
      // Move to next step
      shared.currentStepIndex++;
      
      // Check if we've processed all steps
      if (shared.currentStepIndex >= shared.expectedStepCount) {
        return 'complete';
      }
      
      // Continue to next step
      return 'next';
    } else {
      // Intent not accomplished - continue with more actions
      shared.actionCount++;
      console.log(`→ Continuing to add actions for step (attempt ${shared.actionCount})...`);
      
      // Route back to action type detection for another action
      return 'continue';
    }
  }
}
