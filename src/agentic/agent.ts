/**
 * Agentic Browser Automation Agent
 * 
 * Main agent class that orchestrates planning, reasoning, acting, and reflection.
 * Implements a goal-oriented, autonomous browser automation system.
 */

import type {
  AgentState,
  AgentConfig,
  ActionRecord,
  PlanningResult,
  ReasoningResult,
  DecidedAction,
} from './types.js';
import { createPlan } from './planner.js';
import { reasonAndDecide, validateAction } from './react.js';
import { reflectOnAction, reflectOnProgress } from './reflection.js';
import { 
  determineRecoveryStrategy, 
  classifyError, 
  getRetryDelay, 
  shouldRetryBasedOnError 
} from './recovery.js';
import { captureTargets, buildSelectorForTarget } from '../mimic/selector.js';
import { getNavigationAction, executeNavigationAction } from '../mimic/navigation.js';
import { getClickAction, executeClickAction } from '../mimic/click.js';
import { getFormAction, executeFormAction } from '../mimic/forms.js';
import { smartWait, isPageLoading, detectLoadingIndicators } from './wait.js';

/**
 * Agentic Browser Automation Agent
 * 
 * An autonomous agent that can plan, reason, act, and reflect to achieve
 * browser automation goals.
 */
export class Agent {
  private config: Required<AgentConfig>;
  private state: AgentState;
  private plan?: PlanningResult;
  private currentStepIndex: number = 0;
  private actionRetryCount: Map<string, number> = new Map();

  /**
   * Create a new agent instance
   * 
   * @param config - Agent configuration
   */
  constructor(config: AgentConfig) {
    this.config = {
      maxActions: config.maxActions ?? 50,
      maxRetries: config.maxRetries ?? 3,
      enableReflection: config.enableReflection ?? true,
      enablePlanning: config.enablePlanning ?? true,
      actionTimeout: config.actionTimeout ?? 30000,
      ...config,
    };

    // Initialize state
    this.state = {
      currentUrl: '',
      pageTitle: '',
      availableElements: [],
      actionHistory: [],
      currentGoal: '',
      overallObjective: '',
      goalAchieved: false,
      errors: [],
      metadata: {
        stepCount: 0,
        startTime: Date.now(),
        lastActionTime: Date.now(),
      },
      isLoading: false,
      loadingIndicatorCount: 0,
    };
  }

  /**
   * Initialize the agent with the current page state
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // Capture initial page state
    this.state.currentUrl = this.config.page.url();
    this.state.pageTitle = await this.config.page.title();
    this.state.availableElements = await captureTargets(this.config.page, { interactableOnly: true });
  }

  /**
   * Execute a goal-oriented task
   * 
   * The agent will plan, reason, act, and reflect to achieve the goal.
   * 
   * @param goal - High-level goal to achieve
   * @returns Promise that resolves when the goal is achieved or execution completes
   */
  async executeGoal(goal: string): Promise<{
    success: boolean;
    actionsTaken: number;
    goalAchieved: boolean;
    finalState: AgentState;
  }> {
    this.state.overallObjective = goal;
    this.state.currentGoal = goal;
    this.state.metadata.startTime = Date.now();

    // Initialize if not already done
    if (!this.state.currentUrl) {
      await this.initialize();
    }

    // Planning phase
    if (this.config.enablePlanning) {
      console.log('🤔 Planning execution strategy...');
      this.plan = await createPlan(
        this.config.brain,
        goal,
        {
          url: this.state.currentUrl,
          pageTitle: this.state.pageTitle,
          availableElements: this.state.availableElements.length,
        }
      );
      console.log(`📋 Plan created: ${this.plan.steps.length} steps, complexity: ${this.plan.complexity}`);
      
      if (this.plan.challenges.length > 0) {
        console.log(`⚠️  Potential challenges: ${this.plan.challenges.join(', ')}`);
      }
    }

    // Main execution loop
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;

    while (
      !this.state.goalAchieved &&
      this.state.metadata.stepCount < this.config.maxActions
    ) {
      // Update state before reasoning
      await this.updateState();

      // Check if we should abort
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.log('❌ Too many consecutive failures, aborting...');
        break;
      }

      // Get current step from plan (if planning enabled)
      const currentStep = this.plan?.steps[this.currentStepIndex];

      // Reasoning phase (ReAct pattern)
      console.log('🧠 Reasoning about next action...');
      const reasoning = await reasonAndDecide(
        this.config.brain,
        this.state,
        currentStep
      );

      console.log(`💭 Observation: ${reasoning.observation}`);
      console.log(`🤔 Thought: ${reasoning.thought}`);
      console.log(`✅ Decided: ${reasoning.action.description}`);

      // Validate action
      const validation = validateAction(reasoning.action, this.state);
      if (!validation.feasible) {
        console.log(`⚠️  Action not feasible: ${validation.reason}`);
        this.recordError('validation', validation.reason, 'action validation');
        consecutiveFailures++;
        continue;
      }

      // Execute action
      const actionSuccess = await this.executeAction(reasoning.action, reasoning);

      // Reflection and recovery phase
      if (this.config.enableReflection && this.state.actionHistory.length > 0) {
        const lastAction = this.state.actionHistory[this.state.actionHistory.length - 1];
        if (lastAction) {
          console.log('🔍 Reflecting on action...');
          const reflection = await reflectOnAction(
            this.config.brain,
            lastAction,
            this.state,
            goal
          );
          lastAction.reflection = reflection;

          console.log(`📊 Progress: ${reflection.progressMade ? 'Made progress' : 'No progress'}`);
          console.log(`🎯 Confidence: ${(reflection.confidence * 100).toFixed(0)}%`);

          // Error recovery if action failed
          if (!actionSuccess && lastAction.error) {
            const error = this.state.errors[this.state.errors.length - 1];
            if (error) {
              const retryCount = this.actionRetryCount.get(lastAction.id) || 0;
              
              // Check if we should retry based on error classification
              if (shouldRetryBasedOnError(error, retryCount, this.config.maxRetries)) {
                console.log('🔄 Determining recovery strategy...');
                const recovery = await determineRecoveryStrategy(
                  this.config.brain,
                  error,
                  lastAction,
                  this.state
                );

                if (recovery.shouldRetry && !recovery.abort) {
                  console.log(`🔄 Retrying with strategy: ${recovery.reasoning}`);
                  this.actionRetryCount.set(lastAction.id, retryCount + 1);
                  
                  // Wait with exponential backoff
                  const delay = getRetryDelay(retryCount + 1);
                  await this.config.page.waitForTimeout(delay);
                  
                  // Retry the action (simplified - could be enhanced)
                  consecutiveFailures--; // Don't count retry as a new failure
                  continue; // Loop back to retry
                } else if (recovery.skipAndContinue) {
                  console.log(`⏭️  Skipping action: ${recovery.reasoning}`);
                  consecutiveFailures = 0; // Reset on skip
                } else if (recovery.abort) {
                  console.log(`🛑 Aborting: ${recovery.reasoning}`);
                  break;
                }
              }
            }
          }

          if (reflection.alternatives.length > 0) {
            console.log(`💡 Alternatives: ${reflection.alternatives.join(', ')}`);
          }
        }
      }

      // Update consecutive failures counter
      if (actionSuccess) {
        consecutiveFailures = 0;
        if (this.plan) {
          this.currentStepIndex++;
        }
      } else {
        consecutiveFailures++;
      }

      // Periodic progress reflection
      if (this.state.actionHistory.length % 5 === 0 && this.config.enableReflection) {
        const progressReflection = await reflectOnProgress(
          this.config.brain,
          this.state,
          goal
        );
        console.log(`📈 Overall Progress: ${progressReflection.progressPercentage}%`);
        
        if (progressReflection.shouldPivot && progressReflection.pivotStrategy) {
          console.log(`🔄 Pivoting strategy: ${progressReflection.pivotStrategy}`);
          // Strategy pivot could be implemented here
        }
      }

      // Small delay between actions, but check for loading first
      // If page is loading, wait for loaders instead of fixed delay
      if (this.state.isLoading) {
        await this.autoWaitAfterAction('inter-action');
      } else {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return {
      success: this.state.goalAchieved,
      actionsTaken: this.state.actionHistory.length,
      goalAchieved: this.state.goalAchieved,
      finalState: this.state,
    };
  }

  /**
   * Update the agent's state from the current page
   * 
   * @returns Promise that resolves when state is updated
   */
  private async updateState(): Promise<void> {
    try {
      this.state.currentUrl = this.config.page.url();
      this.state.pageTitle = await this.config.page.title();
      this.state.availableElements = await captureTargets(this.config.page, { interactableOnly: true });
      
      // Check for loading indicators
      const loaders = await detectLoadingIndicators(this.config.page);
      this.state.isLoading = loaders.length > 0;
      this.state.loadingIndicatorCount = loaders.length;
      
      this.state.metadata.lastActionTime = Date.now();
    } catch (error) {
      this.recordError('state_update', String(error), 'state synchronization');
    }
  }

  /**
   * Execute a decided action
   * 
   * @param action - The action to execute
   * @param _reasoning - The reasoning result that led to this action
   * @returns Promise resolving to whether the action was successful
   */
  private async executeAction(
    action: DecidedAction,
    _reasoning: ReasoningResult
  ): Promise<boolean> {
    const actionId = `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const actionRecord: ActionRecord = {
      id: actionId,
      plannedAt: Date.now(),
      actionType: action.type,
      description: action.description,
      parameters: action.parameters,
      success: false,
    };

    try {
      console.log(`⚡ Executing: ${action.description}`);

      actionRecord.executedAt = Date.now();
      this.state.metadata.stepCount++;

      // Execute based on action type
      let success = false;
      let result = '';

      switch (action.type) {
        case 'navigation':
          success = await this.executeNavigation(action, actionRecord);
          break;
        case 'click':
          success = await this.executeClick(action, actionRecord);
          break;
        case 'form':
          success = await this.executeForm(action, actionRecord);
          break;
        case 'assertion':
          success = await this.executeAssertion(action, actionRecord);
          break;
        case 'wait':
          success = await this.executeWait(action, actionRecord);
          break;
        case 'retry':
          success = await this.executeRetry(action, actionRecord);
          break;
        case 'abort':
          console.log('🛑 Aborting execution as requested');
          actionRecord.success = true; // Abort is a valid action
          actionRecord.result = 'Execution aborted';
          this.state.actionHistory.push(actionRecord);
          return true;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      actionRecord.success = success;
      actionRecord.result = result;

      // Check if goal is achieved
      if (success && action.expectedOutcome) {
        // Simple heuristic: if action succeeded and we're checking for goal completion
        // This could be enhanced with more sophisticated goal checking
        await this.checkGoalAchievement();
      }

    } catch (error) {
      actionRecord.success = false;
      actionRecord.error = error instanceof Error ? error.message : String(error);
      const errorClassification = classifyError({
        timestamp: Date.now(),
        type: 'execution',
        message: actionRecord.error,
        context: action.description,
        recovered: false,
      });
      
      this.recordError('execution', actionRecord.error, action.description);
      
      // If it's a transient error, wait before retrying
      if (errorClassification.category === 'transient' && errorClassification.suggestedWait) {
        await this.config.page.waitForTimeout(errorClassification.suggestedWait);
      }
    } finally {
      this.state.actionHistory.push(actionRecord);
    }

    return actionRecord.success;
  }

  /**
   * Execute a navigation action
   */
  private async executeNavigation(
    action: DecidedAction,
    record: ActionRecord
  ): Promise<boolean> {
    try {
      const url = action.parameters.url as string;
      if (!url) {
        throw new Error('Navigation action requires a URL parameter');
      }

      // Use existing navigation logic
      const navigationAction = await getNavigationAction(
        this.config.page,
        this.config.brain,
        `navigate to ${url}`
      );
      await executeNavigationAction(this.config.page, navigationAction);
      
      // Wait for navigation to complete and check for loaders
      await this.config.page.waitForLoadState('networkidle');
      await this.autoWaitAfterAction('navigation');
      await this.updateState();
      
      record.result = `Navigated to ${url}`;
      return true;
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /**
   * Execute a click action
   */
  private async executeClick(
    action: DecidedAction,
    record: ActionRecord,
  ): Promise<boolean> {
    try {
      // Capture targets
      const targetElements = await captureTargets(this.config.page, { interactableOnly: true });
      
      // Use AI to find the right element
      const stepDescription = action.description || 'click on element';
      const clickActionResult = await getClickAction(
        this.config.page,
        this.config.brain,
        stepDescription,
        targetElements
      );

      // Build selector for the best candidate
      const bestCandidate = clickActionResult.candidates[0];
      if (!bestCandidate) {
        throw new Error('No clickable element found');
      }

      const clickable = await buildSelectorForTarget(
        this.config.page,
        targetElements[bestCandidate.index]
      );

      if (!clickable) {
        throw new Error('Could not build selector for target element');
      }

      // Agentic context doesn't have testInfo, pass undefined
      await executeClickAction(clickable, clickActionResult, bestCandidate, undefined, action.description);
      
      // Auto-wait for loading after click
      await this.autoWaitAfterAction('click');
      await this.updateState();
      
      record.result = `Clicked on element: ${bestCandidate.text || bestCandidate.ariaLabel || 'element'}`;
      return true;
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /**
   * Execute a form action
   */
  private async executeForm(
    action: DecidedAction,
    record: ActionRecord
  ): Promise<boolean> {
    try {
      const formElements = await captureTargets(this.config.page, { interactableOnly: true });
      
      // Use AI to determine form action
      const stepDescription = action.description || 'update form';
      const formActionResult = await getFormAction(
        this.config.page,
        this.config.brain,
        stepDescription,
        formElements
      );

      // Find the target element (simplified - could be enhanced)
      const targetElement = await buildSelectorForTarget(
        this.config.page,
        formElements[0] // Simplified - should use AI to find the right field
      );

      if (!targetElement) {
        throw new Error('No form element found');
      }

      // Agentic context doesn't have testInfo, pass undefined
      await executeFormAction(this.config.page, formActionResult, targetElement, undefined, action.description);
      
      // Auto-wait for loading after form action
      await this.autoWaitAfterAction('form');
      await this.updateState();
      
      record.result = `Form action executed: ${formActionResult.type}`;
      return true;
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /**
   * Execute an assertion action
   */
  private async executeAssertion(
    action: DecidedAction,
    record: ActionRecord
  ): Promise<boolean> {
    try {
      // Simple assertion - could be enhanced
      const expected = action.parameters.expected as string;
      const actual = await this.config.page.textContent('body') || '';
      
      const success = actual.includes(expected);
      record.result = success 
        ? `Assertion passed: found "${expected}"`
        : `Assertion failed: expected "${expected}" but not found`;
      
      return success;
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /**
   * Execute a wait action with smart loading detection
   */
  private async executeWait(
    action: DecidedAction,
    record: ActionRecord
  ): Promise<boolean> {
    try {
      const waitType = (action.parameters.waitType as string) || 'smart';
      const duration = (action.parameters.duration as number) || 2000;
      const loaderTimeout = (action.parameters.loaderTimeout as number) || 10000;

      if (waitType === 'smart' || waitType === 'loader') {
        // Smart wait: detect and wait for loading indicators
        const waitResult = await smartWait(this.config.page, {
          loaderTimeout,
          fallbackTimeout: duration,
          waitForNetworkIdle: action.parameters.waitForNetworkIdle as boolean || false,
        });

        if (waitResult.waitedForLoaders) {
          record.result = `Waited for ${waitResult.loaderCount} loading indicator(s) to disappear (${waitResult.duration}ms)`;
        } else {
          record.result = `No loaders detected, waited ${waitResult.duration}ms`;
        }
      } else if (waitType === 'fixed') {
        // Fixed timeout wait
        await this.config.page.waitForTimeout(duration);
        record.result = `Waited for ${duration}ms (fixed timeout)`;
      } else if (waitType === 'network') {
        // Wait for network idle
        await this.config.page.waitForLoadState('networkidle', { timeout: loaderTimeout });
        record.result = `Waited for network to be idle`;
      } else {
        // Default to smart wait
        const waitResult = await smartWait(this.config.page, {
          loaderTimeout,
          fallbackTimeout: duration,
        });
        record.result = `Smart wait completed (${waitResult.duration}ms)`;
      }

      return true;
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /**
   * Automatically wait after actions that might trigger loading
   * This is called after click, form, and navigation actions
   */
  private async autoWaitAfterAction(actionType: string): Promise<void> {
    // Check if page is loading
    const isLoading = await isPageLoading(this.config.page);
    
    if (isLoading) {
      console.log(`⏳ Auto-detected loading state after ${actionType}, waiting for loaders...`);
      await smartWait(this.config.page, {
        loaderTimeout: 5000, // Shorter timeout for auto-waits
        fallbackTimeout: 500,
      });
    } else {
      // Small delay for DOM updates even if no visible loader
      await this.config.page.waitForTimeout(300);
    }
  }

  /**
   * Execute a retry action
   */
  private async executeRetry(
    _action: DecidedAction,
    _record: ActionRecord
  ): Promise<boolean> {
    // Retry logic - could retry the last failed action
    const lastAction = this.state.actionHistory[this.state.actionHistory.length - 1];
    if (lastAction && !lastAction.success) {
      console.log(`🔄 Retrying: ${lastAction.description}`);
      // Simplified retry - could be more sophisticated
      return false; // Indicate retry needs to be handled differently
    }
    return false;
  }

  /**
   * Check if the goal has been achieved
   */
  private async checkGoalAchievement(): Promise<void> {
    // Simple heuristic - could be enhanced with AI-based goal checking
    // For now, we'll use a simple approach where the agent decides through reasoning
    // This could be enhanced to actually verify the goal state
    this.state.goalAchieved = false; // Will be set by reasoning/reflection
  }

  /**
   * Record an error
   */
  private recordError(type: string, message: string, context: string): void {
    this.state.errors.push({
      timestamp: Date.now(),
      type,
      message,
      context,
      recovered: false,
    });
  }

  /**
   * Get the current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get the current plan
   */
  getPlan(): PlanningResult | undefined {
    return this.plan;
  }
}
