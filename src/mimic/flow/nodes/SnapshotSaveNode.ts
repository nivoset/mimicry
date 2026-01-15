/**
 * Snapshot Save Node
 * 
 * Saves execution snapshot after successful test completion.
 */

import { Node } from 'pocketflow';
import type { MimicSharedState } from '../types.js';
import { getSnapshot, saveSnapshot } from '../../storage.js';
import { hashStepText } from '../../storage.js';
import { addAnnotation } from '../../annotations.js';
import type { SnapshotStep } from '../../types.js';

/**
 * Snapshot Save Node - Saves test execution snapshot
 * 
 * Responsibilities:
 * - Build snapshot object from executed steps
 * - Merge with existing snapshot if present
 * - Save snapshot to file
 * - Add annotations
 */
export class SnapshotSaveNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read executed steps, testHash, and testFilePath from shared state
   */
  async prep(shared: MimicSharedState): Promise<{
    executedSteps: MimicSharedState['executedSteps'];
    testHash: string;
    testFilePath: string | undefined;
    input: string;
    expectedStepCount: number;
    troubleshootMode: boolean;
    testInfo: MimicSharedState['testInfo'];
  }> {
    return {
      executedSteps: shared.executedSteps,
      testHash: shared.testHash,
      testFilePath: shared.testFilePath,
      input: shared.input,
      expectedStepCount: shared.expectedStepCount,
      troubleshootMode: shared.troubleshootMode,
      testInfo: shared.testInfo,
    };
  }

  /**
   * Execute: Build snapshot and save it
   */
  async exec({
    executedSteps,
    testHash,
    testFilePath,
    input,
    expectedStepCount,
    troubleshootMode,
  }: {
    executedSteps: MimicSharedState['executedSteps'];
    testHash: string;
    testFilePath: string | undefined;
    input: string;
    expectedStepCount: number;
    troubleshootMode: boolean;
    testInfo: MimicSharedState['testInfo'];
  }): Promise<{ saved: boolean; wasRegeneration: boolean }> {
    if (!testFilePath || executedSteps.length === 0) {
      return { saved: false, wasRegeneration: false };
    }

    // Count unique steps executed (by stepIndex)
    const uniqueStepIndices = new Set(executedSteps.map(step => step.stepIndex));
    const executedStepCount = uniqueStepIndices.size;

    // Only save if we have at least as many steps as input lines
    if (executedStepCount < expectedStepCount) {
      console.warn(`⚠️  Not saving snapshot: only ${executedStepCount} of ${expectedStepCount} steps executed`);
      return { saved: false, wasRegeneration: false };
    }

    // Check if this was a regeneration (snapshot existed but we regenerated)
    const existingSnapshot = await getSnapshot(testFilePath, testHash);
    const wasRegeneration = existingSnapshot !== null;
    const wasFailureBeforeRegeneration = existingSnapshot?.flags?.lastFailedAt !== null;
    const isFirstSuccessfulRun = existingSnapshot === null;
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
      const baseStep: Omit<SnapshotStep, 'targetElement'> = {
        stepHash,
        stepIndex: step.stepIndex,
        stepText: step.stepText,
        actionKind: step.actionKind,
        actionDetails: step.actionDetails,
        executedAt: now,
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
    // Timestamp strategy:
    // - First successful run: Set both createdAt and lastPassedAt to now
    // - Regeneration after failure: Preserve createdAt, update lastPassedAt to now
    // - Regeneration without prior failure: Preserve both createdAt and lastPassedAt (don't update)
    const snapshot = {
      testHash,
      testText: input,
      stepsByHash, // New format: indexed by stepHash for efficient lookup
      steps: snapshotSteps, // Backward compatibility: ordered array
      flags: {
        needsRetry: false,
        hasErrors: false,
        troubleshootingEnabled: troubleshootMode,
        skipSnapshot: false,
        forceRegenerate: false,
        debugMode: false,
        // Preserve original creation time from first successful run
        createdAt: existingSnapshot?.flags?.createdAt || now,
        // Only update lastPassedAt on first creation or after a failure was fixed
        // Preserve the original first successful run time otherwise
        lastPassedAt: isFirstSuccessfulRun
          ? now // First successful run - set timestamp
          : (wasFailureBeforeRegeneration 
            ? now // Regeneration after failure - update timestamp
            : existingSnapshot?.flags?.lastPassedAt || now), // Regeneration without failure - preserve original
        lastFailedAt: null, // Clear failure timestamp on successful run
      },
    };

    await saveSnapshot(testFilePath, snapshot);

    return { saved: true, wasRegeneration };
  }

  /**
   * Post: Add annotations and continue to token usage
   */
  async post(
    shared: MimicSharedState,
    prepRes: {
      executedSteps: MimicSharedState['executedSteps'];
      testHash: string;
      testFilePath: string | undefined;
      input: string;
      expectedStepCount: number;
      troubleshootMode: boolean;
      testInfo: MimicSharedState['testInfo'];
    },
    execRes: { saved: boolean; wasRegeneration: boolean }
  ): Promise<string | undefined> {
    // Add annotation if this was a regeneration
    if (execRes.saved && execRes.wasRegeneration) {
      addAnnotation(
        prepRes.testInfo,
        'test-update',
        '✅ Test actions successfully regenerated and saved'
      );
    }

    // Continue to token usage node
    return 'default';
  }
}
