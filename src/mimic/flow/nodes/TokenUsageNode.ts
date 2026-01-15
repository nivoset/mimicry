/**
 * Token Usage Node
 * 
 * Adds token usage annotations to the test report.
 */

import { Node } from 'pocketflow';
import type { MimicSharedState } from '../types.js';
import { getTestCaseTokens } from '../../../utils/token-counter.js';
import { addAnnotation } from '../../annotations.js';

/**
 * Token Usage Node - Adds token usage annotations
 * 
 * Responsibilities:
 * - Get token counts for the test case
 * - Format token usage annotation
 * - Add annotation to test report
 */
export class TokenUsageNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read testCaseName, testInfo, and snapshotUsed from shared state
   */
  async prep(shared: MimicSharedState): Promise<{
    testCaseName: MimicSharedState['testCaseName'];
    testInfo: MimicSharedState['testInfo'];
    snapshotUsed: boolean;
  }> {
    return {
      testCaseName: shared.testCaseName,
      testInfo: shared.testInfo,
      snapshotUsed: shared.snapshotUsed,
    };
  }

  /**
   * Execute: Get token counts and format annotation
   */
  async exec({
    testCaseName,
    snapshotUsed,
  }: {
    testCaseName: MimicSharedState['testCaseName'];
    testInfo: MimicSharedState['testInfo'];
    snapshotUsed: boolean;
  }): Promise<{ annotation: string | null }> {
    // If snapshot was used, token usage was already added in SnapshotReplayNode
    if (snapshotUsed) {
      return { annotation: null };
    }

    if (!testCaseName) {
      return { annotation: null };
    }

    const tokenCounts = getTestCaseTokens(testCaseName);
    if (!tokenCounts) {
      return { annotation: '📊 Token Usage: 0 tokens' };
    }

    // Format token counts for display
    const tokenEntries = Object.entries(tokenCounts)
      .filter(([_, value]) => value > 0) // Only show non-zero counts
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    const totalTokens = Object.values(tokenCounts).reduce((sum, val) => sum + val, 0);

    if (tokenEntries) {
      return {
        annotation: `📊 Token Usage: ${tokenEntries} (Total: ${totalTokens} tokens)`,
      };
    } else {
      return { annotation: '📊 Token Usage: 0 tokens' };
    }
  }

  /**
   * Post: Add annotation and end flow
   */
  async post(
    shared: MimicSharedState,
    prepRes: {
      testCaseName: MimicSharedState['testCaseName'];
      testInfo: MimicSharedState['testInfo'];
      snapshotUsed: boolean;
    },
    execRes: { annotation: string | null }
  ): Promise<string | undefined> {
    // Add annotation if we have one
    if (execRes.annotation && prepRes.testInfo) {
      addAnnotation(
        prepRes.testInfo,
        'token-usage',
        execRes.annotation
      );
    }

    // End flow
    return undefined;
  }
}
