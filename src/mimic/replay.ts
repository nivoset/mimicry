/**
 * Snapshot Replay Module
 * 
 * Replays test steps from a snapshot without using LLM calls.
 * This provides fast, deterministic test execution for previously successful tests.
 */

import { Page, TestInfo, test } from '@playwright/test';
import type { Snapshot, SnapshotStep } from './types.js';
import { executeNavigationAction } from './navigation.js';
import { executeClickAction } from './click.js';
import { executeFormAction } from './forms.js';
import type { NavigationAction } from './schema/action.js';
import type { ClickActionResult } from './schema/action.js';
import type { FormActionResult } from './forms.js';
import { getMimic } from './markers.js';

/**
 * Replay a complete test from a snapshot
 * 
 * Executes all steps in the snapshot without making LLM calls.
 * This is much faster than normal execution since it skips AI analysis.
 * 
 * @param page - Playwright Page object
 * @param snapshot - Snapshot containing steps to replay
 * @param testInfo - Playwright TestInfo for annotations (optional)
 * @returns Promise that resolves when all steps are replayed
 */
export async function replayFromSnapshot(
  page: Page,
  snapshot: Snapshot,
  testInfo?: TestInfo
): Promise<void> {
  // Replay each step in order
  for (const step of snapshot.steps) {
    await test.step(step.stepText, async () => {
      switch (step.actionKind) {
        case 'navigation':
          await replayNavigationStep(page, step, testInfo);
          break;
        case 'click':
          await replayClickStep(page, step, testInfo);
          break;
        case 'form update':
          await replayFormStep(page, step, testInfo);
          break;
        default:
          throw new Error(`Unknown action kind in snapshot: ${(step as any).actionKind}`);
      }
    });
  }
}

/**
 * Replay a navigation step from snapshot
 * 
 * @param page - Playwright Page object
 * @param step - Snapshot step containing navigation action
 * @param testInfo - Playwright TestInfo for annotations (optional)
 * @returns Promise that resolves when navigation is complete
 */
async function replayNavigationStep(
  page: Page,
  step: SnapshotStep,
  testInfo?: TestInfo
): Promise<void> {
  const actionDetails = step.actionDetails as NavigationAction;
  await executeNavigationAction(page, actionDetails, testInfo, step.stepText);
}

/**
 * Replay a click step from snapshot
 * 
 * Reconstructs the locator from stored target element information.
 * 
 * @param page - Playwright Page object
 * @param step - Snapshot step containing click action
 * @param testInfo - Playwright TestInfo for annotations (optional)
 * @returns Promise that resolves when click is complete
 */
async function replayClickStep(
  page: Page,
  step: SnapshotStep,
  testInfo?: TestInfo
): Promise<void> {
  const actionDetails = step.actionDetails as ClickActionResult;
  
  // Reconstruct the target element from snapshot using marker ID
  if (!step.targetElement || step.targetElement.mimicId === undefined) {
    throw new Error(`Snapshot step ${step.stepIndex} (click) is missing targetElement with mimicId`);
  }

  // Use marker ID to get the locator
  // If we have a stored selector, try to use it first as a fallback
  let element;
  if (step.targetElement.selector) {
    try {
      element = page.locator(step.targetElement.selector);
      // Verify the element exists
      await element.waitFor({ timeout: 5000 });
    } catch (error) {
      // Selector might be stale, fall back to marker ID
      console.warn(`Stored selector failed for step ${step.stepIndex}, using marker ID ${step.targetElement.mimicId}`);
      element = getMimic(page, step.targetElement.mimicId);
    }
  } else {
    // Use marker ID directly
    element = getMimic(page, step.targetElement.mimicId);
  }

  // Find the selected candidate from the click action result
  // The first candidate should be the one we used originally
  const selectedCandidate = actionDetails.candidates[0];
  if (!selectedCandidate) {
    throw new Error(`Snapshot step ${step.stepIndex} (click) has no candidates in actionDetails`);
  }

  await executeClickAction(
    element,
    actionDetails,
    selectedCandidate,
    testInfo,
    step.stepText
  );
}

/**
 * Replay a form step from snapshot
 * 
 * Reconstructs the form element locator from stored target element information.
 * 
 * @param page - Playwright Page object
 * @param step - Snapshot step containing form action
 * @param testInfo - Playwright TestInfo for annotations (optional)
 * @returns Promise that resolves when form action is complete
 */
async function replayFormStep(
  page: Page,
  step: SnapshotStep,
  testInfo?: TestInfo
): Promise<void> {
  const actionDetails = step.actionDetails as FormActionResult;
  
  // Reconstruct the target element from snapshot using marker ID
  if (!step.targetElement || step.targetElement.mimicId === undefined) {
    throw new Error(`Snapshot step ${step.stepIndex} (form) is missing targetElement with mimicId`);
  }

  // Use marker ID to get the locator
  // If we have a stored selector, try to use it first as a fallback
  let element;
  if (step.targetElement.selector) {
    try {
      element = page.locator(step.targetElement.selector);
      // Verify the element exists
      await element.waitFor({ timeout: 5000 });
    } catch (error) {
      // Selector might be stale, fall back to marker ID
      console.warn(`Stored selector failed for step ${step.stepIndex}, using marker ID ${step.targetElement.mimicId}`);
      element = getMimic(page, step.targetElement.mimicId);
    }
  } else {
    // Use marker ID directly
    element = getMimic(page, step.targetElement.mimicId);
  }

  await executeFormAction(
    page,
    actionDetails,
    element,
    testInfo,
    step.stepText
  );
}
