/**
 * ReAct Module (Reasoning and Acting)
 * 
 * Implements the ReAct pattern: combines reasoning with real-time action execution.
 * The agent observes, thinks, and decides what action to take next.
 */

import { type LanguageModel, generateText, Output } from 'ai';
import { z } from 'zod';
import type { ReasoningResult, DecidedAction, AgentState } from './types.js';
import { countTokens } from '../utils/token-counter.js';

/**
 * Schema for reasoning result validation
 */
const zDecidedAction = z.object({
  type: z.enum(['navigation', 'click', 'form', 'assertion', 'wait', 'retry', 'abort']).describe('Type of action to take'),
  description: z.string().describe('Human-readable description of the action'),
  parameters: z.record(z.string(), z.unknown()).describe('Parameters needed to execute this action'),
  expectedOutcome: z.string().describe('What should happen after this action'),
  rationale: z.string().describe('Why this action was chosen'),
});

const zReasoningResult = z.object({
  observation: z.string().describe('What the agent observed about the current state'),
  thought: z.string().describe('What the agent is thinking about the situation'),
  action: zDecidedAction.describe('The action the agent decided to take'),
  confidence: z.number().min(0).max(1).describe('Confidence level in this decision (0-1)'),
  alternatives: z.array(zDecidedAction).default([]).describe('Alternative actions that were considered'),
});

/**
 * Reason about the current state and decide on the next action
 * 
 * Implements the ReAct pattern: Observe → Think → Act
 * 
 * @param brain - Language model for reasoning
 * @param state - Current agent state
 * @param currentStep - Current step from the plan (if planning is enabled)
 * @returns Promise resolving to reasoning result with decided action
 */
export async function reasonAndDecide(
  brain: LanguageModel,
  state: AgentState,
  currentStep?: {
    description: string;
    expectedActionType: string;
    successCriteria: string;
  }
): Promise<ReasoningResult> {
  // Build context from state
  const actionHistory = state.actionHistory
    .slice(-5) // Last 5 actions for context
    .map(a => `- ${a.description} (${a.success ? 'success' : 'failed'})`)
    .join('\n');

  const recentErrors = state.errors
    .slice(-3) // Last 3 errors
    .map(e => `- ${e.type}: ${e.message}`)
    .join('\n');

  const stepContext = currentStep
    ? `
**Current Plan Step:**
- Description: ${currentStep.description}
- Expected Action Type: ${currentStep.expectedActionType}
- Success Criteria: ${currentStep.successCriteria}
`
    : '';

  const prompt = `You are an intelligent browser automation agent using the ReAct (Reasoning and Acting) pattern.

**Your Goal:**
${state.overallObjective}

**Current State:**
- URL: ${state.currentUrl}
- Page Title: ${state.pageTitle}
- Available Interactive Elements: ${state.availableElements.length}
- Actions Taken: ${state.actionHistory.length}
- Goal Achieved: ${state.goalAchieved ? 'Yes' : 'No'}
- Page Loading: ${state.isLoading ? `Yes (${state.loadingIndicatorCount} indicator(s) visible)` : 'No'}

${stepContext}

**Recent Action History:**
${actionHistory || 'No actions taken yet'}

**Recent Errors:**
${recentErrors || 'No errors'}

**Available Elements Summary:**
${state.availableElements.slice(0, 10).map((el, i) => 
  `${i + 1}. ${el.tag} - ${el.text || el.ariaLabel || el.label || 'no text'}`
).join('\n')}
${state.availableElements.length > 10 ? `... and ${state.availableElements.length - 10} more` : ''}

**Instructions:**
1. **Observe**: Analyze the current state - what do you see? What's the situation?
2. **Think**: What should you do next? Consider:
   - Are you closer to the goal?
   - What actions are available?
   - What worked or didn't work before?
   - What's the best next step?
3. **Act**: Decide on a specific action to take:
   - navigation: Navigate to a URL
   - click: Click on an element (specify which one in parameters)
   - form: Fill a form field (specify field and value in parameters)
   - assertion: Verify something (specify what to check in parameters)
   - wait: Wait for loading to complete or a specific condition
     * Use wait when you detect loading indicators, need to wait for dynamic content,
       or after actions that might trigger async operations
     * Parameters: waitType ("smart" to detect loaders, "fixed" for fixed timeout, "network" for network idle)
     * duration: fallback timeout in ms (default: 2000)
     * loaderTimeout: max time to wait for loaders (default: 10000)
   - retry: Retry a previous action with modifications
   - abort: Give up if goal seems unachievable

**Important**: If you see loading indicators, spinners, or expect dynamic content to load after an action, use a "wait" action. The system will automatically detect and wait for loading indicators to disappear.

4. Consider alternatives - what other actions could work?
5. Assess your confidence in this decision

Think step-by-step using the ReAct pattern: Observe → Think → Act.`;

  const result = await generateText({
    model: brain,
    prompt,
    maxRetries: 3,
    output: Output.object({ schema: zReasoningResult, name: 'reasoningResult' }),
  });

  await countTokens(result);

  return result.output;
}

/**
 * Validate that a decided action is feasible given the current state
 * 
 * @param action - The action to validate
 * @param state - Current agent state
 * @returns Whether the action is feasible and why
 */
export function validateAction(action: DecidedAction, state: AgentState): {
  feasible: boolean;
  reason: string;
} {
  // Check if we've exceeded max actions
  if (state.metadata.stepCount > (state.metadata.stepCount + 100)) {
    return {
      feasible: false,
      reason: 'Maximum action limit reached',
    };
  }

  // Check if goal is already achieved
  if (state.goalAchieved && action.type !== 'assertion') {
    return {
      feasible: false,
      reason: 'Goal already achieved, no further actions needed',
    };
  }

  // Validate action-specific requirements
  switch (action.type) {
    case 'navigation':
      if (!action.parameters.url) {
        return {
          feasible: false,
          reason: 'Navigation action requires a URL parameter',
        };
      }
      break;

    case 'click':
      if (state.availableElements.length === 0) {
        return {
          feasible: false,
          reason: 'No clickable elements available on the page',
        };
      }
      break;

    case 'form':
      if (state.availableElements.filter(el => 
        el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select'
      ).length === 0) {
        return {
          feasible: false,
          reason: 'No form elements available on the page',
        };
      }
      break;
  }

  return {
    feasible: true,
    reason: 'Action is feasible',
  };
}
