/**
 * Reflection Module
 * 
 * Implements the Reflection Pattern for agentic systems.
 * Evaluates actions and outcomes to improve future performance.
 */

import { type LanguageModel, generateText, Output } from 'ai';
import { z } from 'zod';
import type { ActionReflection, ActionRecord, AgentState } from './types.js';
import { countTokens } from '../utils/token-counter.js';

/**
 * Schema for action reflection validation
 */
const zActionReflection = z.object({
  progressMade: z.boolean().describe('Whether this action moved closer to the goal'),
  confidence: z.number().min(0).max(1).describe('Confidence that the action was successful (0-1)'),
  learnings: z.array(z.string()).default([]).describe('What was learned from this action'),
  suggestions: z.array(z.string()).default([]).describe('Suggestions for improving future actions'),
  shouldRetry: z.boolean().describe('Whether this action should be retried'),
  alternatives: z.array(z.string()).default([]).describe('Alternative approaches to consider'),
});

/**
 * Reflect on an action's outcome and effectiveness
 * 
 * Evaluates whether the action was successful, what was learned,
 * and whether it should be retried or if alternatives should be considered.
 * 
 * @param brain - Language model for reflection
 * @param action - The action that was executed
 * @param state - Current agent state after the action
 * @param goal - The overall goal being pursued
 * @returns Promise resolving to reflection on the action
 */
export async function reflectOnAction(
  brain: LanguageModel,
  action: ActionRecord,
  state: AgentState,
  goal: string
): Promise<ActionReflection> {
  const previousState = state.actionHistory.length > 1
    ? state.actionHistory[state.actionHistory.length - 2]
    : null;

  const prompt = `You are an intelligent agent reflecting on an action you just took.

**Your Goal:**
${goal}

**Action Taken:**
- Type: ${action.actionType}
- Description: ${action.description}
- Parameters: ${JSON.stringify(action.parameters, null, 2)}
- Success: ${action.success ? 'Yes' : 'No'}
- Result: ${action.result || 'No result recorded'}
${action.error ? `- Error: ${action.error}` : ''}

**Current State After Action:**
- URL: ${state.currentUrl}
- Page Title: ${state.pageTitle}
- Available Elements: ${state.availableElements.length}
- Total Actions: ${state.actionHistory.length}
- Goal Achieved: ${state.goalAchieved ? 'Yes' : 'No'}

**Previous Action (for comparison):**
${previousState ? `- ${previousState.description} (${previousState.success ? 'success' : 'failed'})` : 'This was the first action'}

**Instructions:**
1. **Evaluate Progress**: Did this action move you closer to the goal?
2. **Assess Confidence**: How confident are you that this action was successful?
3. **Identify Learnings**: What did you learn from this action?
   - What worked?
   - What didn't work?
   - What patterns do you notice?
4. **Generate Suggestions**: How could similar actions be improved in the future?
5. **Decide on Retry**: Should this action be retried? (Consider: was it a transient failure? Is there a better approach?)
6. **Consider Alternatives**: What other approaches could achieve the same goal?

Think critically and provide honest, actionable reflection.`;

  const result = await generateText({
    model: brain,
    prompt,
    maxRetries: 3,
    output: Output.object({ schema: zActionReflection, name: 'actionReflection' }),
  });

  await countTokens(result);

  return result.output;
}

/**
 * Reflect on overall progress toward the goal
 * 
 * Evaluates the agent's overall performance and suggests strategic changes.
 * 
 * @param brain - Language model for reflection
 * @param state - Current agent state
 * @param goal - The overall goal
 * @returns Promise resolving to strategic reflection
 */
export async function reflectOnProgress(
  brain: LanguageModel,
  state: AgentState,
  goal: string
): Promise<{
  onTrack: boolean;
  progressPercentage: number;
  insights: string[];
  recommendations: string[];
  shouldPivot: boolean;
  pivotStrategy?: string | undefined;
}> {
  const recentActions = state.actionHistory.slice(-10);
  const successRate = recentActions.length > 0
    ? recentActions.filter(a => a.success).length / recentActions.length
    : 0;

  const prompt = `You are evaluating overall progress toward a goal.

**Goal:**
${goal}

**Current State:**
- Actions Taken: ${state.actionHistory.length}
- Recent Success Rate: ${(successRate * 100).toFixed(1)}%
- Goal Achieved: ${state.goalAchieved ? 'Yes' : 'No'}
- Current URL: ${state.currentUrl}
- Errors Encountered: ${state.errors.length}

**Recent Actions:**
${recentActions.map(a => `- ${a.description} (${a.success ? '✓' : '✗'})`).join('\n')}

**Errors:**
${state.errors.slice(-5).map(e => `- ${e.type}: ${e.message}`).join('\n')}

**Instructions:**
1. Assess if the agent is on track to achieve the goal
2. Estimate progress percentage (0-100%)
3. Identify key insights about the approach
4. Provide strategic recommendations
5. Determine if a pivot in strategy is needed
6. If pivoting, suggest a new strategy

Be honest and strategic in your assessment.`;

  const result = await generateText({
    model: brain,
    prompt,
    maxRetries: 3,
    output: Output.object({
      schema: z.object({
        onTrack: z.boolean().describe('Whether the agent is on track to achieve the goal'),
        progressPercentage: z.number().min(0).max(100).describe('Estimated progress percentage'),
        insights: z.array(z.string()).describe('Key insights about the approach'),
        recommendations: z.array(z.string()).describe('Strategic recommendations'),
        shouldPivot: z.boolean().describe('Whether the strategy should be changed'),
        pivotStrategy: z.string().optional().describe('New strategy if pivoting is recommended'),
      }),
      name: 'progressReflection',
    }),
  });

  await countTokens(result);

  return result.output;
}
