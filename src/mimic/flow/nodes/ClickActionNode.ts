/**
 * Click Action Node
 * 
 * Executes click actions on buttons, links, or other interactive elements.
 */

import { Node } from 'pocketflow';
import { test } from '@playwright/test';
import type { MimicSharedState } from '../types.js';
import { getClickAction, executeClickAction } from '../../click.js';
import { getMimic } from '../../markers.js';
import type { MarkerTargetElement } from '../../types.js';
import type { StepExecutionResult } from '../../../mimic.js';

/**
 * Click Action Node - Executes click actions
 * 
 * Responsibilities:
 * - Get click action details from AI
 * - Select best candidate element
 * - Execute click action
 * - Store result in executed steps
 */
export class ClickActionNode extends Node<MimicSharedState> {
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
   * Execute: Get click action and execute it
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
    // Get click action from AI
    const clickActionResult = await getClickAction(
      page,
      brains,
      step,
      testContext!,
      testCaseName
    );

    // Defensive check: ensure candidates array exists and is valid
    if (!clickActionResult || !clickActionResult.candidates || !Array.isArray(clickActionResult.candidates)) {
      throw new Error(`Invalid click action result: candidates array is missing or invalid for step: ${step}`);
    }

    // Select best candidate (highest confidence)
    const selectedCandidate = clickActionResult.candidates
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .find(Boolean);
    
    if (!selectedCandidate) {
      throw new Error(`No candidate element found for click action: ${step}`);
    }

    // Use marker ID from the candidate to get the locator
    if (!selectedCandidate.mimicId) {
      throw new Error(`Selected candidate is missing mimicId for click action: ${step}`);
    }

    const clickable = getMimic(page, selectedCandidate.mimicId);
    const clickResult = await executeClickAction(
      clickable,
      clickActionResult,
      selectedCandidate,
      testInfo,
      step
    );

    // Store best selector descriptor with mimicId as fallback
    if (!clickResult.selector) {
      throw new Error(`Could not generate selector for click action: ${step}`);
    }

    const targetElement: MarkerTargetElement = {
      selector: clickResult.selector,
      mimicId: selectedCandidate.mimicId,
    };

      return {
        actionDetails: clickResult.actionResult,
        targetElement,
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
      actionKind: 'click',
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
