/**
 * Step Processor Node
 * 
 * Processes a single test step. Checks if step is cached in snapshot,
 * and either replays it or routes to regeneration.
 */

import { Node } from 'pocketflow';
import { test } from '@playwright/test';
import type { MimicSharedState } from '../types.js';
import { hashStepText } from '../../storage.js';
import { getFromSelector } from '../../selectorUtils.js';
import { getMimic } from '../../markers.js';
import { executeNavigationAction } from '../../navigation.js';
import { executeClickAction } from '../../click.js';
import { executeFormAction } from '../../forms.js';
import type { NavigationAction } from '../../schema/action.js';
import type { ClickActionResult } from '../../schema/action.js';
import type { FormActionResult } from '../../forms.js';
import type { StepExecutionResult } from '../../../mimic.js';

/**
 * Step Processor Node - Handles step execution or caching
 * 
 * Responsibilities:
 * - Check if step exists in snapshot
 * - Replay cached step if available
 * - Route to action type detection if step needs regeneration
 * - Track step execution results
 */
export class StepProcessorNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read current step, stepIndex, and snapshot data from shared state
   */
  async prep(shared: MimicSharedState): Promise<{
    stepIndex: number;
    step: string;
    existingStepsByHash: Record<string, any>;
    existingSnapshot: MimicSharedState['existingSnapshot'];
    useSnapshot: boolean;
    page: MimicSharedState['page'];
    testInfo: MimicSharedState['testInfo'];
  }> {
    const stepIndex = shared.currentStepIndex;
    const step = shared.steps[stepIndex];

    return {
      stepIndex,
      step: step || '',
      existingStepsByHash: shared.existingStepsByHash,
      existingSnapshot: shared.existingSnapshot,
      useSnapshot: shared.useSnapshot,
      page: shared.page,
      testInfo: shared.testInfo,
    };
  }

  /**
   * Execute: Check if step is cached and should be replayed
   */
  async exec({
    stepIndex,
    step,
    existingStepsByHash,
    existingSnapshot,
    useSnapshot,
    page,
    testInfo,
  }: {
    stepIndex: number;
    step: string;
    existingStepsByHash: Record<string, any>;
    existingSnapshot: MimicSharedState['existingSnapshot'];
    useSnapshot: boolean;
    page: MimicSharedState['page'];
    testInfo: MimicSharedState['testInfo'];
  }): Promise<{ shouldReplay: boolean; cachedStep?: any }> {
    // Check if this step already exists in the snapshot
    const stepHash = hashStepText(step);
    const existingStep = existingStepsByHash[stepHash];

    // If step exists in snapshot and we're not forcing full regeneration, use it for replay
    // Note: Full snapshot replay (all steps) is handled in SnapshotReplayNode
    // This is for selective regeneration: only regenerate steps that don't exist in the snapshot
    if (existingStep && existingSnapshot && !existingSnapshot.flags?.forceRegenerate && !useSnapshot) {
      return { shouldReplay: true, cachedStep: existingStep };
    }

    return { shouldReplay: false };
  }

  /**
   * Post: Replay cached step or route to regeneration
   */
  async post(
    shared: MimicSharedState,
    prepRes: {
      stepIndex: number;
      step: string;
      existingStepsByHash: Record<string, any>;
      existingSnapshot: MimicSharedState['existingSnapshot'];
      useSnapshot: boolean;
      page: MimicSharedState['page'];
      testInfo: MimicSharedState['testInfo'];
    },
    execRes: { shouldReplay: boolean; cachedStep?: any }
  ): Promise<string | undefined> {
    const { stepIndex, step, page, testInfo } = prepRes;

    // If step should be replayed from cache
    if (execRes.shouldReplay && execRes.cachedStep) {
      console.log(`📦 [mimic] Using cached step: "${step}" (hash: ${hashStepText(step)})`);
      
      try {
        await test.step(step, async () => {
          // Replay the step from snapshot
          const existingStep = execRes.cachedStep;
          let stepResult: StepExecutionResult;

          switch (existingStep.actionKind) {
            case 'navigation':
              const navAction = existingStep.actionDetails as NavigationAction;
              await executeNavigationAction(page, navAction, testInfo, step);
              
              stepResult = {
                stepIndex,
                stepText: step,
                actionKind: 'navigation',
                actionDetails: navAction,
              };
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
              
              stepResult = {
                stepIndex,
                stepText: step,
                actionKind: 'click',
                actionDetails: clickAction,
                targetElement: existingStep.targetElement,
              };
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
              
              stepResult = {
                stepIndex,
                stepText: step,
                actionKind: 'form update',
                actionDetails: formAction,
                targetElement: existingStep.targetElement,
              };
              break;

            default:
              throw new Error(`Unknown action kind: ${existingStep.actionKind}`);
          }

          // Add to executed steps for snapshot
          shared.executedSteps.push(stepResult);
        });

        // Move to next step
        shared.currentStepIndex++;
        
        // Check if we've processed all steps
        if (shared.currentStepIndex >= shared.expectedStepCount) {
          return 'complete';
        }
        
        // Continue to next step
        return 'next';
      } catch (error) {
        // Replay failed - fall through to regenerate
        console.warn(`⚠️  [mimic] Cached step replay failed, regenerating: ${error instanceof Error ? error.message : String(error)}`);
        // Fall through to regeneration
      }
    }

    // Step doesn't exist in snapshot or replay failed - route to regeneration
    console.log(`🔄 [mimic] Regenerating step: "${step}" (hash: ${hashStepText(step)})`);
    
    // Reset step-specific state
    shared.currentStepActions = [];
    shared.intentAccomplished = false;
    shared.actionCount = 0;
    
    // Route to action type detection
    return 'regenerate';
  }
}
