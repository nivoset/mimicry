/**
 * Snapshot Check Node
 * 
 * Checks if a snapshot exists and should be used for replay.
 * Determines whether to use full snapshot replay or proceed with regeneration.
 */

import { Node } from 'pocketflow';
import type { MimicSharedState } from '../types.js';
import { shouldUseSnapshot, getSnapshot } from '../../storage.js';

/**
 * Snapshot Check Node - Determines snapshot usage strategy
 * 
 * Responsibilities:
 * - Check if snapshot should be used based on troubleshoot mode and file path
 * - Load existing snapshot if available
 * - Build map of existing steps by hash for selective regeneration
 * - Set useSnapshot flag in shared state
 */
export class SnapshotCheckNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read testHash, testFilePath, troubleshootMode from shared state
   */
  async prep(shared: MimicSharedState): Promise<{
    testHash: string;
    testFilePath: string | undefined;
    troubleshootMode: boolean;
    expectedStepCount: number;
  }> {
    return {
      testHash: shared.testHash,
      testFilePath: shared.testFilePath,
      troubleshootMode: shared.troubleshootMode,
      expectedStepCount: shared.expectedStepCount,
    };
  }

  /**
   * Execute: Check if snapshot should be used and load it
   */
  async exec({
    testHash,
    testFilePath,
    troubleshootMode,
    expectedStepCount,
  }: {
    testHash: string;
    testFilePath: string | undefined;
    troubleshootMode: boolean;
    expectedStepCount: number;
  }): Promise<{
    useSnapshot: boolean;
    existingSnapshot: MimicSharedState['existingSnapshot'];
    existingStepsByHash: Record<string, any>;
  }> {
    // Check if we should use an existing snapshot
    // Even in troubleshoot mode, try to use snapshot first - only regenerate on failure
    const useSnapshot = testFilePath && await shouldUseSnapshot(
      testFilePath,
      testHash,
      troubleshootMode,
      expectedStepCount
    );

    let existingSnapshot: MimicSharedState['existingSnapshot'] = null;
    const existingStepsByHash: Record<string, any> = {};

    // Load existing snapshot if file path is available
    if (testFilePath) {
      existingSnapshot = await getSnapshot(testFilePath, testHash);
      
      // Build a map of existing steps by their hash for quick lookup
      // This enables selective regeneration: only regenerate steps that don't exist in the snapshot
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
    }

    return {
      useSnapshot: useSnapshot || false,
      existingSnapshot,
      existingStepsByHash,
    };
  }

  /**
   * Post: Store snapshot decision and existing snapshot data
   */
  async post(
    shared: MimicSharedState,
    _prepRes: {
      testHash: string;
      testFilePath: string | undefined;
      troubleshootMode: boolean;
      expectedStepCount: number;
    },
    execRes: {
      useSnapshot: boolean;
      existingSnapshot: MimicSharedState['existingSnapshot'];
      existingStepsByHash: Record<string, any>;
    }
  ): Promise<string | undefined> {
    // Store snapshot data in shared state
    shared.useSnapshot = execRes.useSnapshot;
    shared.existingSnapshot = execRes.existingSnapshot;
    shared.existingStepsByHash = execRes.existingStepsByHash;

    // Route to snapshot replay if snapshot should be used, otherwise continue to initial screenshot
    return execRes.useSnapshot ? 'replay' : 'continue';
  }
}
