/**
 * Action Type Node
 * 
 * Determines the action type for a step (navigation, click, or form update).
 * Routes to the appropriate execution node based on the action type.
 */

import { Node } from 'pocketflow';
import type { MimicSharedState } from '../types.js';
import { getBaseAction } from '../../actionType.js';
import type { TestContext } from '../../../mimic.js';

/**
 * Action Type Node - Classifies step action type
 * 
 * Responsibilities:
 * - Build test context from previous steps and current state
 * - Call getBaseAction to determine action type
 * - Store action type in shared state
 * - Route to appropriate execution node
 */
export class ActionTypeNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read step, context, and page state from shared state
   */
  async prep(shared: MimicSharedState): Promise<{
    step: string;
    stepIndex: number;
    executedSteps: MimicSharedState['executedSteps'];
    page: MimicSharedState['page'];
    steps: string[];
    brains: MimicSharedState['brains'];
    testCaseName: MimicSharedState['testCaseName'];
  }> {
    const stepIndex = shared.currentStepIndex;
    const step = shared.steps[stepIndex] || '';

    return {
      step,
      stepIndex,
      executedSteps: shared.executedSteps,
      page: shared.page,
      steps: shared.steps,
      brains: shared.brains,
      testCaseName: shared.testCaseName,
    };
  }

  /**
   * Execute: Determine action type using AI
   */
  async exec({
    step,
    stepIndex,
    executedSteps,
    page,
    steps,
    brains,
    testCaseName,
  }: {
    step: string;
    stepIndex: number;
    executedSteps: MimicSharedState['executedSteps'];
    page: MimicSharedState['page'];
    steps: string[];
    brains: MimicSharedState['brains'];
    testCaseName: MimicSharedState['testCaseName'];
  }): Promise<{ actionType: 'navigation' | 'click' | 'form update'; testContext: TestContext }> {
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

    // Get base action type
    const baseAction = await getBaseAction(
      page,
      brains,
      step,
      testContext,
      testCaseName
    );

    return {
      actionType: baseAction.kind as 'navigation' | 'click' | 'form update',
      testContext,
    };
  }

  /**
   * Post: Store action type and route to appropriate execution node
   */
  async post(
    shared: MimicSharedState,
    _prepRes: {
      step: string;
      stepIndex: number;
      executedSteps: MimicSharedState['executedSteps'];
      page: MimicSharedState['page'];
      steps: string[];
      brains: MimicSharedState['brains'];
      testCaseName: MimicSharedState['testCaseName'];
    },
    execRes: { actionType: 'navigation' | 'click' | 'form update'; testContext: TestContext }
  ): Promise<string | undefined> {
    // Store action type and test context in shared state
    shared.currentActionType = execRes.actionType;
    shared.testContext = execRes.testContext;
    
    // Increment action count for this step
    shared.actionCount++;

    // Route to appropriate execution node
    return execRes.actionType;
  }
}
