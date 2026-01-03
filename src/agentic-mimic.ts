/**
 * Agentic Mimic Integration
 * 
 * Provides an agentic version of the mimic function that uses the Agent class
 * for goal-oriented, autonomous browser automation.
 */

import { Page, TestInfo, test } from '@playwright/test';
import type { LanguageModel } from 'ai';
import { Agent, type AgentConfig } from './agentic/index.js';
import { startTestCase } from './utils/token-counter.js';

/**
 * Agentic Mimic function type
 * Similar to Mimic but uses goal-oriented agentic execution
 */
export type AgenticMimic = (goal: TemplateStringsArray, ...args: unknown[]) => Promise<{
  success: boolean;
  actionsTaken: number;
  goalAchieved: boolean;
}>;

/**
 * Trim template string and combine with interpolated values
 * 
 * @param strings - Template string array
 * @param values - Interpolated values
 * @returns Combined and trimmed string
 */
function trimTemplate(strings: TemplateStringsArray, ...values: any[]): string {
  let result = strings.reduce((acc, str, i) => {
    return acc + str + (values[i] ?? '');
  }, '');

  // Split into lines, trim each, filter out empty lines, and join back
  return result
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Agentic mimic function that uses goal-oriented agentic execution
 * 
 * Instead of executing steps sequentially, this function uses an agent
 * that plans, reasons, acts, and reflects to achieve the goal.
 * 
 * @param goal - High-level goal to achieve (can be multi-line)
 * @param config - Configuration with page, brains, and optional testInfo
 * @returns Promise resolving to execution result
 */
export async function agenticMimic(
  goal: string,
  { page, brains, testInfo, ...agentConfig }: {
    page: Page,
    brains: LanguageModel,
    testInfo?: TestInfo,
  } & Partial<Omit<AgentConfig, 'page' | 'brain'>>
): Promise<{
  success: boolean;
  actionsTaken: number;
  goalAchieved: boolean;
}> {
  if (testInfo?.title) await startTestCase(testInfo.title);

  // Combine multi-line goal into a single goal statement
  const goalLines = goal.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const combinedGoal = goalLines.length > 1
    ? goalLines.join(' and then ')
    : goalLines[0] || goal;

  // Create agent configuration
  const config: AgentConfig = {
    brain: brains,
    page,
    maxActions: agentConfig.maxActions ?? 50,
    maxRetries: agentConfig.maxRetries ?? 3,
    enableReflection: agentConfig.enableReflection ?? true,
    enablePlanning: agentConfig.enablePlanning ?? true,
    actionTimeout: agentConfig.actionTimeout ?? 30000,
  };

  // Create and initialize agent
  const agent = new Agent(config);
  await agent.initialize();

  // Execute goal within a test step for better traceability
  const stepDescription = combinedGoal.length > 50 
    ? combinedGoal.substring(0, 50) + '...'
    : combinedGoal;

  return await test.step(stepDescription, async () => {
    const result = await agent.executeGoal(combinedGoal);
    
    // Log summary
    console.log(`\n📊 Execution Summary:`);
    console.log(`   Goal: ${combinedGoal}`);
    console.log(`   Success: ${result.success ? '✓' : '✗'}`);
    console.log(`   Actions Taken: ${result.actionsTaken}`);
    console.log(`   Goal Achieved: ${result.goalAchieved ? 'Yes' : 'No'}`);
    
    if (result.finalState.errors.length > 0) {
      console.log(`   Errors: ${result.finalState.errors.length}`);
    }

    return {
      success: result.success,
      actionsTaken: result.actionsTaken,
      goalAchieved: result.goalAchieved,
    };
  });
}

/**
 * Create an agentic mimic function with configuration
 * 
 * Similar to createMimic but returns an agentic version that uses
 * goal-oriented agentic execution instead of step-by-step execution.
 * 
 * @param config - Configuration with page, brains, testInfo, and optional agent config
 * @returns Agentic mimic function
 */
export const createAgenticMimic = (config: {
  page: Page,
  brains: LanguageModel,
  testInfo?: TestInfo,
} & Partial<Omit<AgentConfig, 'page' | 'brain'>>) => {
  return async (goal: TemplateStringsArray, ...args: unknown[]) => {
    const goalString = trimTemplate(goal, ...args);
    return await agenticMimic(goalString, config);
  };
};
