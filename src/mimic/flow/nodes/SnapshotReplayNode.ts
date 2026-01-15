/**
 * Snapshot Replay Node
 * 
 * Replays test execution from a saved snapshot if available.
 * If replay succeeds, the flow ends. If it fails, the flow continues to regeneration.
 */

import { Node } from 'pocketflow';
import type { MimicSharedState } from '../types.js';
import { replayFromSnapshot } from '../../replay.js';
import { addAnnotation } from '../../annotations.js';
import { recordFailure } from '../../storage.js';

/**
 * Snapshot Replay Node - Replays test from snapshot
 * 
 * Responsibilities:
 * - Attempt to replay test from snapshot
 * - Handle replay success (end flow with token usage)
 * - Handle replay failure (continue to regeneration)
 * - Add appropriate annotations
 */
export class SnapshotReplayNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read snapshot, page, and testInfo from shared state
   */
  async prep(shared: MimicSharedState): Promise<{
    snapshot: MimicSharedState['existingSnapshot'];
    page: MimicSharedState['page'];
    testInfo: MimicSharedState['testInfo'];
    testHash: string;
    testFilePath: string | undefined;
  }> {
    return {
      snapshot: shared.existingSnapshot,
      page: shared.page,
      testInfo: shared.testInfo,
      testHash: shared.testHash,
      testFilePath: shared.testFilePath,
    };
  }

  /**
   * Execute: Attempt to replay from snapshot
   */
  async exec({
    snapshot,
    page,
    testInfo,
    testHash,
    testFilePath,
  }: {
    snapshot: MimicSharedState['existingSnapshot'];
    page: MimicSharedState['page'];
    testInfo: MimicSharedState['testInfo'];
    testHash: string;
    testFilePath: string | undefined;
  }): Promise<{ success: boolean; error?: string }> {
    if (!snapshot) {
      return { success: false, error: 'No snapshot available' };
    }

    // Add annotation indicating we're loading from snapshot
    addAnnotation(
      testInfo,
      'snapshot-load',
      `📦 Loading test from mimic snapshot file (${snapshot.steps.length} step${snapshot.steps.length !== 1 ? 's' : ''} cached)`
    );

    try {
      // Replay from snapshot (skip LLM calls for faster execution)
      await replayFromSnapshot(page, snapshot, testInfo);
      return { success: true };
    } catch (error) {
      // Replay failed - regenerate actions
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Add annotation at the top indicating test is being updated
      addAnnotation(
        testInfo,
        'test-update',
        `🔄 Test snapshot replay failed, regenerating actions: ${errorMessage}`
      );

      // Record the failure before regenerating
      if (testFilePath) {
        await recordFailure(
          testFilePath,
          testHash,
          undefined,
          undefined,
          errorMessage
        );
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Post: Set snapshotUsed flag and route accordingly
   */
  async post(
    shared: MimicSharedState,
    _prepRes: {
      snapshot: MimicSharedState['existingSnapshot'];
      page: MimicSharedState['page'];
      testInfo: MimicSharedState['testInfo'];
      testHash: string;
      testFilePath: string | undefined;
    },
    execRes: { success: boolean; error?: string }
  ): Promise<string | undefined> {
    if (execRes.success) {
      // Replay succeeded - mark as snapshot used and end flow
      shared.snapshotUsed = true;
      
      // Add token usage annotation (0 tokens for snapshot replay)
      if (shared.testCaseName && shared.testInfo) {
        addAnnotation(
          shared.testInfo,
          'token-usage',
          `📊 Token Usage: 0 tokens (snapshot replay - no AI calls)`
        );
      }
      
      // End flow
      return undefined;
    } else {
      // Replay failed - continue to regeneration
      // Check if we have a failed snapshot and add annotation
      if (shared.testFilePath && shared.existingSnapshot?.flags?.lastFailedAt) {
        addAnnotation(
          shared.testInfo,
          'test-update',
          '🔄 Regenerating test actions due to previous failure'
        );
      }
      
      // Continue to initial screenshot and step processing
      return 'continue';
    }
  }
}
