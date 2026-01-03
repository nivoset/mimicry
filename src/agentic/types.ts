/**
 * Agentic System Types
 * 
 * Core type definitions for the agentic browser automation system.
 * This system implements planning, reasoning, acting, and reflection patterns.
 */

import { Page } from '@playwright/test';
import type { LanguageModel } from 'ai';
import type { TargetInfo } from '../mimic/selector.js';

/**
 * Agent State: Represents the current state of the agent and the page
 */
export interface AgentState {
  /** Current URL of the page */
  currentUrl: string;
  /** Page title */
  pageTitle: string;
  /** Available interactive elements on the page */
  availableElements: TargetInfo[];
  /** History of actions taken so far */
  actionHistory: ActionRecord[];
  /** Current goal or objective */
  currentGoal: string;
  /** Overall objective the agent is trying to achieve */
  overallObjective: string;
  /** Whether the goal has been achieved */
  goalAchieved: boolean;
  /** Any errors encountered during execution */
  errors: ErrorRecord[];
  /** Metadata about the current execution context */
  metadata: {
    stepCount: number;
    startTime: number;
    lastActionTime: number;
  };
  /** Whether the page is currently in a loading state */
  isLoading: boolean;
  /** Number of visible loading indicators */
  loadingIndicatorCount: number;
}

/**
 * Action Record: Tracks a single action execution
 */
export interface ActionRecord {
  /** Unique identifier for this action */
  id: string;
  /** Timestamp when action was planned */
  plannedAt: number;
  /** Timestamp when action was executed */
  executedAt?: number;
  /** Type of action (click, navigation, form, etc.) */
  actionType: string;
  /** Description of what the action was supposed to do */
  description: string;
  /** Parameters used for the action */
  parameters: Record<string, unknown>;
  /** Whether the action was successful */
  success: boolean;
  /** Result or outcome of the action */
  result?: string;
  /** Error if the action failed */
  error?: string;
  /** Reflection on the action's effectiveness */
  reflection?: ActionReflection;
}

/**
 * Action Reflection: Agent's evaluation of an action's effectiveness
 */
export interface ActionReflection {
  /** Whether the action moved closer to the goal */
  progressMade: boolean;
  /** Confidence in the action's success (0-1) */
  confidence: number;
  /** What was learned from this action */
  learnings: string[];
  /** Suggestions for improvement */
  suggestions: string[];
  /** Whether a retry is recommended */
  shouldRetry: boolean;
  /** Alternative approaches to consider */
  alternatives: string[];
}

/**
 * Error Record: Tracks errors and failures
 */
export interface ErrorRecord {
  /** Timestamp when error occurred */
  timestamp: number;
  /** Type of error */
  type: string;
  /** Error message */
  message: string;
  /** Context where error occurred */
  context: string;
  /** Whether the error was recovered from */
  recovered: boolean;
  /** Recovery action taken */
  recoveryAction?: string;
}

/**
 * Planning Result: Output from the planning phase
 */
export interface PlanningResult {
  /** High-level plan broken into steps */
  steps: PlanStep[];
  /** Estimated complexity/difficulty */
  complexity: 'low' | 'medium' | 'high';
  /** Potential challenges or risks */
  challenges: string[];
  /** Prerequisites or dependencies */
  prerequisites: string[];
}

/**
 * Plan Step: A single step in the execution plan
 */
export interface PlanStep {
  /** Step number/order */
  order: number;
  /** Description of what this step should accomplish */
  description: string;
  /** Expected action type */
  expectedActionType: string;
  /** Success criteria for this step */
  successCriteria: string;
  /** Dependencies on previous steps */
  dependencies: number[];
}

/**
 * Reasoning Result: Output from the reasoning phase (ReAct pattern)
 */
export interface ReasoningResult {
  /** What the agent observed about the current state */
  observation: string;
  /** What the agent is thinking about doing */
  thought: string;
  /** The action the agent decided to take */
  action: DecidedAction;
  /** Confidence in this decision (0-1) */
  confidence: number;
  /** Alternative actions considered */
  alternatives: DecidedAction[];
}

/**
 * Decided Action: An action the agent has decided to take
 */
export interface DecidedAction {
  /** Type of action */
  type: 'navigation' | 'click' | 'form' | 'assertion' | 'wait' | 'retry' | 'abort';
  /** Description of the action */
  description: string;
  /** Parameters for the action */
  parameters: Record<string, unknown>;
  /** Expected outcome */
  expectedOutcome: string;
  /** Rationale for choosing this action */
  rationale: string;
}

/**
 * Agent Configuration: Configuration for the agentic system
 */
export interface AgentConfig {
  /** Language model to use for reasoning */
  brain: LanguageModel;
  /** Playwright page object */
  page: Page;
  /** Maximum number of actions before aborting */
  maxActions?: number;
  /** Maximum retries per action */
  maxRetries?: number;
  /** Whether to enable reflection */
  enableReflection?: boolean;
  /** Whether to enable planning */
  enablePlanning?: boolean;
  /** Timeout for actions in milliseconds */
  actionTimeout?: number;
}
