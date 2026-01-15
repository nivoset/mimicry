/**
 * Initialize Node
 * 
 * Initializes the test case, parses input into steps, and generates test hash.
 * This is the first node in the flow and sets up the initial state.
 */

import { Node } from 'pocketflow';
import type { MimicSharedState } from '../types.js';
import { startTestCase } from '../../../utils/token-counter.js';
import { hashTestText } from '../../storage.js';

/**
 * Initialize Node - Sets up test execution state
 * 
 * Responsibilities:
 * - Parse input string into individual steps
 * - Start test case tracking for token counting
 * - Generate test hash for snapshot identification
 * - Set initial state values
 */
export class InitializeNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read input and config from shared state
   */
  async prep(shared: MimicSharedState): Promise<{ input: string; testInfo: MimicSharedState['testInfo'] }> {
    return {
      input: shared.input,
      testInfo: shared.testInfo,
    };
  }

  /**
   * Execute: Parse steps, start test case, generate hash
   */
  async exec({ input, testInfo }: { input: string; testInfo: MimicSharedState['testInfo'] }): Promise<{
    steps: string[];
    testHash: string;
    expectedStepCount: number;
  }> {
    // Parse input into steps
    const steps = input
      .split('\n')
      .map(step => step.trim())
      .filter((step): step is string => step.length > 0);

    const expectedStepCount = steps.length;

    // Start test case tracking if test case name is available
    const testCaseName = testInfo?.title;
    if (testCaseName) {
      await startTestCase(testCaseName);
    }

    // Generate test hash for snapshot identification
    const testHash = hashTestText(input);

    return {
      steps,
      testHash,
      expectedStepCount,
    };
  }

  /**
   * Post: Store parsed steps, testHash, and expectedStepCount in shared state
   */
  async post(
    shared: MimicSharedState,
    _prepRes: { input: string; testInfo: MimicSharedState['testInfo'] },
    execRes: { steps: string[]; testHash: string; expectedStepCount: number }
  ): Promise<string | undefined> {
    // Store parsed data in shared state
    shared.steps = execRes.steps;
    shared.testHash = execRes.testHash;
    shared.expectedStepCount = execRes.expectedStepCount;
    shared.testCaseName = shared.testInfo?.title;
    
    // Initialize execution tracking
    shared.executedSteps = [];
    shared.currentStepIndex = 0;
    shared.currentStepActions = [];
    shared.intentAccomplished = false;
    shared.actionCount = 0;
    shared.maxActionsPerStep = 10;

    // Continue to next node
    return 'default';
  }
}
