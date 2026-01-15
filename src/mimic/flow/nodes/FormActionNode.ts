/**
 * Form Action Node
 * 
 * Executes form update actions (fill, type, select, check, etc.).
 */

import { Node } from 'pocketflow';
import { test } from '@playwright/test';
import type { MimicSharedState } from '../types.js';
import { getFormAction, executeFormAction } from '../../forms.js';
import { getMimic } from '../../markers.js';
import type { MarkerTargetElement } from '../../types.js';
import type { StepExecutionResult } from '../../../mimic.js';

/**
 * Form Action Node - Executes form update actions
 * 
 * Responsibilities:
 * - Get form action details from AI
 * - Get target form element
 * - Execute form action
 * - Store result in executed steps
 */
export class FormActionNode extends Node<MimicSharedState> {
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
   * Execute: Get form action and execute it
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
  }): Promise<{ actionDetails: any; targetElement: MarkerTargetElement }> {
    // Wrap execution in test.step for Playwright reporting
    const { test } = await import('@playwright/test');
    
    return await test.step(step, async () => {
    // Get form action from AI
    const formActionResult = await getFormAction(
      page,
      brains,
      step,
      testContext!,
      testCaseName
    );

    // Use marker ID from the form result to get the locator
    if (!formActionResult.mimicId) {
      throw new Error(`Form action result is missing mimicId for form action: ${step}`);
    }

    const targetFormElement = getMimic(page, formActionResult.mimicId);
    const formResult = await executeFormAction(
      page,
      formActionResult,
      targetFormElement,
      testInfo,
      step
    );

    // Handle the return type - executeFormAction returns { actionResult, selector }
    const selector = formResult.selector;
    const actionDetails = formResult.actionResult;

    // Store best selector descriptor with mimicId as fallback
    if (!selector) {
      throw new Error(`Could not generate selector for form action: ${step}`);
    }

    const formTargetElement: MarkerTargetElement = {
      selector,
      mimicId: formActionResult.mimicId,
    };

      return {
        actionDetails,
        targetElement: formTargetElement,
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
    execRes: { actionDetails: any; targetElement: MarkerTargetElement }
  ): Promise<string | undefined> {
    // Create step result
    const stepResult: StepExecutionResult = {
      stepIndex: prepRes.stepIndex,
      stepText: prepRes.step,
      actionKind: 'form update',
      actionDetails: execRes.actionDetails,
      targetElement: execRes.targetElement,
    };

    // Add to current step actions and executed steps
    shared.currentStepActions.push(stepResult);
    shared.executedSteps.push(stepResult);

    // Route to intent check
    return 'intent-check';
  }
}
