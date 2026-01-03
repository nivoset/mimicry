/**
 * Planning Module
 * 
 * Implements the Planning Pattern for agentic systems.
 * Breaks down high-level goals into actionable steps with dependencies.
 */

import { type LanguageModel, generateText, Output } from 'ai';
import { z } from 'zod';
import type { PlanningResult } from './types.js';
import { countTokens } from '../utils/token-counter.js';

/**
 * Schema for planning result validation
 * 
 * Note: All fields must be required (no .default()) for AI SDK structured output compatibility.
 * Empty arrays should be provided by the AI model when there are no values.
 */
const zPlanStep = z.object({
  order: z.number().int().positive().describe('Step number in execution order'),
  description: z.string().describe('Clear description of what this step should accomplish'),
  expectedActionType: z.enum(['navigation', 'click', 'form', 'assertion', 'wait']).describe('Type of action expected for this step'),
  successCriteria: z.string().describe('How to determine if this step was successful'),
  dependencies: z.array(z.number().int().positive()).describe('Step numbers this step depends on (provide empty array [] if no dependencies)'),
});

const zPlanningResult = z.object({
  steps: z.array(zPlanStep).min(1).describe('Ordered list of steps to achieve the goal'),
  complexity: z.enum(['low', 'medium', 'high']).describe('Estimated complexity of the overall plan'),
  challenges: z.array(z.string()).describe('Potential challenges or risks identified (provide empty array [] if none)'),
  prerequisites: z.array(z.string()).describe('Prerequisites or requirements before starting (provide empty array [] if none)'),
});

/**
 * Create an execution plan from a high-level goal
 * 
 * Uses AI to decompose a goal into actionable steps with dependencies,
 * success criteria, and risk assessment.
 * 
 * @param brain - Language model for planning
 * @param goal - High-level goal or objective
 * @param currentState - Current state of the page/agent (optional)
 * @returns Promise resolving to a structured plan
 */
export async function createPlan(
  brain: LanguageModel,
  goal: string,
  currentState?: {
    url?: string;
    pageTitle?: string;
    availableElements?: number;
  }
): Promise<PlanningResult> {
  const stateContext = currentState
    ? `
Current State:
- URL: ${currentState.url || 'unknown'}
- Page Title: ${currentState.pageTitle || 'unknown'}
- Available Interactive Elements: ${currentState.availableElements || 0}
`
    : '';

  const prompt = `You are an expert test automation planner specializing in browser automation using Playwright.

Your task is to break down a high-level goal into a structured, executable plan.

**Goal:**
${goal}

${stateContext}

**Instructions:**
1. Break the goal into logical, sequential steps
2. Each step should be:
   - Specific and actionable
   - Have clear success criteria
   - Identify dependencies on previous steps
   - Specify the expected action type (navigation, click, form, assertion, wait)
3. Consider potential challenges (dynamic content, timing issues, element availability)
4. Identify any prerequisites (e.g., "must be logged in", "must be on specific page")
5. Assess overall complexity (low: 1-3 steps, medium: 4-7 steps, high: 8+ steps or complex interactions)

**Action Types:**
- navigation: Moving to a new page or URL
- click: Clicking buttons, links, or interactive elements
- form: Filling forms, selecting options, entering data
- assertion: Verifying state, content, or conditions
- wait: Waiting for conditions, loading, or timing

**Output Format:**
Return a structured plan with:
- Ordered steps (each with description, expected action type, success criteria, dependencies)
  - dependencies: array of step numbers this step depends on (use empty array [] if no dependencies)
- Overall complexity assessment
- Potential challenges (use empty array [] if none)
- Prerequisites (use empty array [] if none)

**Important:** Always provide all fields, including empty arrays [] when there are no dependencies, challenges, or prerequisites.

Think step-by-step and create a comprehensive plan.`;

  const result = await generateText({
    model: brain,
    prompt,
    maxRetries: 3,
    output: Output.object({ schema: zPlanningResult, name: 'executionPlan' }),
  });

  await countTokens(result);

  return result.output;
}

/**
 * Refine a plan based on execution feedback
 * 
 * Updates the plan when steps fail or when new information is discovered.
 * 
 * @param brain - Language model for planning
 * @param originalPlan - The original plan that needs refinement
 * @param feedback - Feedback from execution (failures, discoveries, etc.)
 * @returns Promise resolving to a refined plan
 */
export async function refinePlan(
  brain: LanguageModel,
  originalPlan: PlanningResult,
  feedback: {
    failedStep?: number;
    failureReason?: string;
    discoveredInfo?: string;
    currentState?: string;
  }
): Promise<PlanningResult> {
  const prompt = `You are refining an execution plan based on feedback from execution.

**Original Plan:**
${JSON.stringify(originalPlan, null, 2)}

**Execution Feedback:**
${feedback.failedStep ? `Step ${feedback.failedStep} failed: ${feedback.failureReason}` : ''}
${feedback.discoveredInfo ? `New information discovered: ${feedback.discoveredInfo}` : ''}
${feedback.currentState ? `Current state: ${feedback.currentState}` : ''}

**Instructions:**
1. Analyze why the plan failed or what new information was discovered
2. Refine the plan by:
   - Adjusting failed steps (fix approach, add prerequisites, break into smaller steps)
   - Adding new steps if needed based on discoveries
   - Updating dependencies if step order needs to change
   - Revising complexity assessment if needed
3. Maintain the overall goal while adapting to new information

Return a refined plan that addresses the feedback.`;

  const result = await generateText({
    model: brain,
    prompt,
    maxRetries: 3,
    output: Output.object({ schema: zPlanningResult, name: 'refinedPlan' }),
  });

  await countTokens(result);

  return result.output;
}
