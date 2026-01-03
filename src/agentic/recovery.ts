/**
 * Error Recovery Module
 * 
 * Implements error recovery strategies and retry logic for the agentic system.
 */

import { type LanguageModel, generateText, Output } from 'ai';
import { z } from 'zod';
import type { ErrorRecord, ActionRecord, AgentState } from './types.js';
import { countTokens } from '../utils/token-counter.js';

/**
 * Recovery strategy schema
 */
const zRecoveryStrategy = z.object({
  shouldRetry: z.boolean().describe('Whether to retry the failed action'),
  retryAction: z.string().optional().describe('Modified action to retry'),
  alternativeApproach: z.string().optional().describe('Alternative approach to try'),
  skipAndContinue: z.boolean().describe('Whether to skip this action and continue'),
  abort: z.boolean().describe('Whether to abort execution'),
  reasoning: z.string().describe('Reasoning behind the recovery strategy'),
});

/**
 * Analyze an error and determine recovery strategy
 * 
 * @param brain - Language model for recovery planning
 * @param error - The error that occurred
 * @param failedAction - The action that failed
 * @param state - Current agent state
 * @returns Promise resolving to recovery strategy
 */
export async function determineRecoveryStrategy(
  brain: LanguageModel,
  error: ErrorRecord,
  failedAction: ActionRecord,
  state: AgentState
): Promise<{
  shouldRetry: boolean;
  retryAction?: string;
  alternativeApproach?: string;
  skipAndContinue: boolean;
  abort: boolean;
  reasoning: string;
}> {
  const recentErrors = state.errors
    .slice(-5)
    .map(e => `- ${e.type}: ${e.message} (${e.context})`)
    .join('\n');

  const prompt = `You are an error recovery specialist for browser automation.

**Failed Action:**
- Type: ${failedAction.actionType}
- Description: ${failedAction.description}
- Parameters: ${JSON.stringify(failedAction.parameters, null, 2)}
- Error: ${error.type} - ${error.message}
- Context: ${error.context}

**Current State:**
- URL: ${state.currentUrl}
- Actions Taken: ${state.actionHistory.length}
- Goal: ${state.overallObjective}

**Recent Errors:**
${recentErrors || 'No previous errors'}

**Instructions:**
Analyze the error and determine the best recovery strategy:

1. **Should Retry?** 
   - Is this a transient error (network, timing, element not ready)?
   - Would retrying with the same action likely succeed?
   - Consider: if this is the 3rd+ retry, probably don't retry again

2. **Retry Action**
   - If retrying, suggest modifications (e.g., add wait, use different selector)
   - Keep it concise and actionable

3. **Alternative Approach**
   - If retry won't work, suggest a completely different approach
   - Consider: different element, different action type, different strategy

4. **Skip and Continue**
   - Is this action non-critical? Can we proceed without it?
   - Only skip if the goal can still be achieved

5. **Abort**
   - Should we give up? Only if goal seems unachievable
   - Consider: too many failures, fundamental issue, goal impossible

Provide a clear recovery strategy with reasoning.`;

  const result = await generateText({
    model: brain,
    prompt,
    maxRetries: 2,
    output: Output.object({ schema: zRecoveryStrategy, name: 'recoveryStrategy' }),
  });

  await countTokens(result);

  const output = result.output;
  const result_obj: {
    shouldRetry: boolean;
    retryAction?: string;
    alternativeApproach?: string;
    skipAndContinue: boolean;
    abort: boolean;
    reasoning: string;
  } = {
    shouldRetry: output.shouldRetry,
    skipAndContinue: output.skipAndContinue,
    abort: output.abort,
    reasoning: output.reasoning,
  };
  
  if (output.retryAction !== undefined) {
    result_obj.retryAction = output.retryAction;
  }
  
  if (output.alternativeApproach !== undefined) {
    result_obj.alternativeApproach = output.alternativeApproach;
  }
  
  return result_obj;
}

/**
 * Classify error type for appropriate recovery
 * 
 * @param error - The error record
 * @returns Error classification
 */
export function classifyError(error: ErrorRecord): {
  category: 'transient' | 'permanent' | 'environment' | 'logic' | 'unknown';
  recoverable: boolean;
  suggestedWait?: number;
} {
  const message = error.message.toLowerCase();
  const type = error.type.toLowerCase();

  // Transient errors (network, timing, element not ready)
  if (
    message.includes('timeout') ||
    message.includes('wait') ||
    message.includes('not ready') ||
    message.includes('loading') ||
    message.includes('network') ||
    type.includes('timeout')
  ) {
    return {
      category: 'transient',
      recoverable: true,
      suggestedWait: 2000,
    };
  }

  // Environment errors (page not found, element not found)
  if (
    message.includes('not found') ||
    message.includes('element') && message.includes('missing') ||
    message.includes('selector') ||
    type.includes('not_found')
  ) {
    return {
      category: 'environment',
      recoverable: true,
    };
  }

  // Logic errors (invalid action, wrong parameters)
  if (
    message.includes('invalid') ||
    message.includes('parameter') ||
    message.includes('required') ||
    type.includes('validation')
  ) {
    return {
      category: 'logic',
      recoverable: false,
    };
  }

  // Permanent errors (permission denied, blocked)
  if (
    message.includes('permission') ||
    message.includes('blocked') ||
    message.includes('forbidden') ||
    message.includes('unauthorized')
  ) {
    return {
      category: 'permanent',
      recoverable: false,
    };
  }

  return {
    category: 'unknown',
    recoverable: true,
  };
}

/**
 * Get retry delay based on attempt number
 * 
 * Implements exponential backoff for retries.
 * 
 * @param attemptNumber - Current retry attempt (1-based)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns Delay in milliseconds
 */
export function getRetryDelay(attemptNumber: number, baseDelay: number = 1000): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), 10000);
  return delay;
}

/**
 * Check if an action should be retried based on error classification
 * 
 * @param error - The error that occurred
 * @param retryCount - Number of times this action has been retried
 * @param maxRetries - Maximum number of retries allowed
 * @returns Whether to retry
 */
export function shouldRetryBasedOnError(
  error: ErrorRecord,
  retryCount: number,
  maxRetries: number
): boolean {
  if (retryCount >= maxRetries) {
    return false;
  }

  const classification = classifyError(error);
  
  // Don't retry permanent or logic errors
  if (!classification.recoverable) {
    return false;
  }

  // Retry transient errors
  if (classification.category === 'transient') {
    return true;
  }

  // Retry environment errors (element might appear)
  if (classification.category === 'environment' && retryCount < 2) {
    return true;
  }

  // Unknown errors: retry once
  if (classification.category === 'unknown' && retryCount < 1) {
    return true;
  }

  return false;
}
