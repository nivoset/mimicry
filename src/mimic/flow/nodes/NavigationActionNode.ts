/**
 * Navigation Action Node
 * 
 * Executes navigation actions (navigate, goBack, goForward, refresh, etc.).
 */

import { Node } from 'pocketflow';
import { test } from '@playwright/test';
import type { MimicSharedState } from '../types.js';
import { getNavigationAction, executeNavigationAction } from '../../navigation.js';
import type { StepExecutionResult } from '../../../mimic.js';

/**
 * Navigation Action Node - Executes navigation actions
 * 
 * Responsibilities:
 * - Get navigation action details from AI
 * - Execute navigation action
 * - Store result in executed steps
 */
export class NavigationActionNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read step, context, and page from shared state
   */
  async prep(shared: MimicSharedState): Promise<{
    step: string;
    stepIndex: number;
    testContext: MimicSharedState['testContext'];
    page: MimicSharedState['page'];
    brains: MimicSharedState['brains'];
    testCaseName: MimicSharedState['testCaseName'];
    testInfo: MimicSharedState['testInfo'];
  }> {
    const stepIndex = shared.currentStepIndex;
    const step = shared.steps[stepIndex] || '';

    return {
      step,
      stepIndex,
      testContext: shared.testContext!,
      page: shared.page,
      brains: shared.brains,
      testCaseName: shared.testCaseName,
      testInfo: shared.testInfo,
    };
  }

  /**
   * Execute: Get navigation action and execute it
   */
  async exec({
    step,
    stepIndex,
    testContext,
    page,
    brains,
    testCaseName,
    testInfo,
  }: {
    step: string;
    stepIndex: number;
    testContext: MimicSharedState['testContext'];
    page: MimicSharedState['page'];
    brains: MimicSharedState['brains'];
    testCaseName: MimicSharedState['testCaseName'];
    testInfo: MimicSharedState['testInfo'];
  }): Promise<{ actionDetails: any }> {
    // Wrap execution in test.step for Playwright reporting
    const { test } = await import('@playwright/test');
    
    return await test.step(step, async () => {
      // Get navigation action from AI
      const navigationAction = await getNavigationAction(
        page,
        brains,
        step,
        testContext!,
        testCaseName
      );

      // Execute navigation action
      const executedNavAction = await executeNavigationAction(
        page,
        navigationAction,
        testInfo,
        step
      );

      return {
        actionDetails: executedNavAction,
      };
    });
  }

  /**
   * Post: Store result in executed steps and route to intent check
   */
  async post(
    shared: MimicSharedState,
    prepRes: {
      step: string;
      stepIndex: number;
      testContext: MimicSharedState['testContext'];
      page: MimicSharedState['page'];
      brains: MimicSharedState['brains'];
      testCaseName: MimicSharedState['testCaseName'];
      testInfo: MimicSharedState['testInfo'];
    },
    execRes: { actionDetails: any }
  ): Promise<string | undefined> {
    // Create step result
    const stepResult: StepExecutionResult = {
      stepIndex: prepRes.stepIndex,
      stepText: prepRes.step,
      actionKind: 'navigation',
      actionDetails: execRes.actionDetails,
    };

    // Add to current step actions and executed steps
    shared.currentStepActions.push(stepResult);
    shared.executedSteps.push(stepResult);

    // Route to intent check
    return 'intent-check';
  }
}
