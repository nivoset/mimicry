/**
 * Mimic Flow - AI-powered browser testing framework
 * 
 * Uses PocketFlow to orchestrate test execution through a series of nodes.
 * Each node handles a specific responsibility, enabling better organization,
 * testability, and advanced agentic patterns.
 */

import { Page, TestInfo } from '@playwright/test';
import type { LanguageModel } from 'ai';
import { createMimicFlow } from './mimic/flow/createMimicFlow.js';
import type { MimicSharedState } from './mimic/flow/types.js';
import { isTroubleshootMode } from './mimic/cli.js';
import { recordFailure } from './mimic/storage.js';


export type Mimic = (steps: TemplateStringsArray, ...args: unknown[]) => Promise<void>;

/**
 * Test context that tracks previous state and actions for better decision-making
 */
export interface TestContext {
  /** Previous steps that have been executed */
  previousSteps: Array<{
    stepIndex: number;
    stepText: string;
    actionKind: string;
    url?: string;
    pageTitle?: string;
  }>;
  /** Current page state */
  currentState: {
    url: string;
    pageTitle: string;
  };
  /** Total number of steps in the test */
  totalSteps: number;
  /** Current step index */
  currentStepIndex: number;
}



/**
 * Mimic function - Executes test steps using PocketFlow
 * 
 * @param input - Input string to process (test steps, one per line)
 * @param config - Configuration object with page, brains, testInfo, etc.
 * @returns Promise that resolves when test execution completes
 */
export async function mimic(input: string, { page, brains, testInfo, testFilePath, troubleshootMode }: {
  page: Page,
  brains: LanguageModel,
  testInfo: TestInfo | undefined,
  testFilePath?: string,
  troubleshootMode?: boolean,
}) {
  // Determine troubleshoot mode
  const isTroubleshoot = troubleshootMode ?? isTroubleshootMode();

  // Initialize shared state
  const shared: MimicSharedState = {
    input,
    steps: [],
    testHash: '',
    ...(testInfo?.title ? { testCaseName: testInfo.title } : {}),
    ...(testInfo ? { testInfo } : {}),
    ...(testFilePath ? { testFilePath } : {}),
    troubleshootMode: isTroubleshoot,
    snapshotUsed: false,
    existingSnapshot: null,
    existingStepsByHash: {},
    executedSteps: [],
    currentStepIndex: 0,
    expectedStepCount: 0,
    useSnapshot: false,
    page,
    brains,
    currentStepActions: [],
    intentAccomplished: false,
    actionCount: 0,
    maxActionsPerStep: 10,
  };

  // Create and run the flow
  const flow = createMimicFlow();
  
  try {
    await flow.run(shared);
  } catch (error) {
    // Record failure if we have a test file path
    if (testFilePath) {
      const stepIndex = shared.currentStepIndex;
      const step = shared.steps[stepIndex] || 'Unknown step';
      
      await recordFailure(
        testFilePath,
        shared.testHash,
        stepIndex,
        step,
        error instanceof Error ? error.message : String(error),
        shared.input
      );
    }
    
    // Re-throw with step information
    const stepIndex = shared.currentStepIndex;
    const step = shared.steps[stepIndex] || 'Unknown step';
    throw new Error(
      `Step ${stepIndex + 1} failed: ${step}\n${error instanceof Error ? error.message : String(error)}`
    );
  }
}
/**
 * Trims and normalizes template literal input
 * Filters out empty lines to prevent processing blank steps
 * 
 * @param strings - Template string array
 * @param values - Interpolated values
 * @returns Normalized string with empty lines removed
 */
function trimTemplate(strings: TemplateStringsArray, ...values: any[]): string {
  // Combine the template string with interpolated values
  let result = strings.reduce((acc, str, i) => {
    return acc + str + (values[i] ?? '');
  }, '');

  // Split into lines, trim whitespace, filter out empty lines, and join back
  // Empty lines are filtered out to prevent processing blank steps
  return result
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0) // Filter out empty lines after trimming
    .join('\n');
}

export const createMimic = (config: {
  page: Page,
  brains: LanguageModel,
  eyes?: LanguageModel,
  testInfo?: TestInfo,
}) => {
  // Extract test file path from TestInfo if available
  // Pass full file path (not directory) to storage functions
  const testFilePath = config.testInfo?.file || undefined;

  config.eyes = config.eyes ?? config.brains;
  // Check troubleshoot mode
  const troubleshootMode = isTroubleshootMode();
  
  return async (prompt: TemplateStringsArray, ...args: unknown[]) => {
    const lines = trimTemplate(prompt, ...args);
    return await mimic(lines, {
      page: config.page,
      brains: config.brains,
      testInfo: config.testInfo,
      ...(testFilePath ? { testFilePath } : {}),
      troubleshootMode,
    });
  }
}
