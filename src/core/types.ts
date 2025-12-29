/**
 * Core types and interfaces for the PocketFlow-inspired TypeScript workflow system
 */

/**
 * Base context interface that all shared contexts must extend
 */
export interface BaseContext extends Record<string, any> {}

/**
 * Context change tracking information
 */
export interface ContextChange {
  key: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
  operation: 'set' | 'delete' | 'define';
}

/**
 * Context proxy configuration
 */
export interface ContextProxyConfig {
  trackChanges?: boolean;
  enableUndo?: boolean;
  maxHistorySize?: number;
  readOnlyKeys?: string[];
  onChangeCallback?: (change: ContextChange) => void;
  applyPartialChangesOnError?: boolean;
}

/**
 * Tracked context wrapper that records all changes
 */
export interface TrackedContext<C extends BaseContext = BaseContext> {
  context: C;
  changes: ContextChange[];
  readonly: boolean;
  startTracking(): void;
  stopTracking(): void;
  getChanges(): ContextChange[];
  clearChanges(): void;
  applyChanges(targetContext: C): void;
  revertChanges(): void;
  createSnapshot(): C;
}

/**
 * Action identifier returned by nodes to determine flow transitions
 */
export type Action = string | void | undefined;

/**
 * Configuration for retry behavior on node failures
 */
export interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number; // milliseconds
  exponentialBackoff?: boolean;
}

/**
 * Core Node interface following the prep/exec/next pattern
 * 
 * @template C - The shared context type that will be bound to `this`
 * @template PrepRes - Type of the result returned by prep()
 * @template ExecRes - Type of the result returned by exec()
 */
export interface Node<C extends BaseContext = BaseContext, PrepRes = any, ExecRes = any> {
  /**
   * Optional unique identifier for this node
   */
  id?: string;

  /**
   * Preparation phase: Gather inputs from shared context
   * Should only read data and prepare inputs for exec phase
   * 
   * @returns The prepared data to pass to exec(), or a Promise of that data
   */
  prep?(this: C): PrepRes | Promise<PrepRes>;

  /**
   * Execution phase: Perform the core computation or external call
   * Should be pure computation - avoid direct context modification
   * 
   * @param input - The result from prep() phase
   * @returns The execution result, or a Promise of that result
   */
  exec?(this: C, input: PrepRes): ExecRes | Promise<ExecRes>;

  /**
   * Next/Post phase: Handle output and determine flow transition
   * Can modify shared context and must return action for next step
   * 
   * @param prepResult - The result from prep() phase
   * @param execResult - The result from exec() phase
   * @returns Action string for next node, or void/undefined for default action
   */
  next?(this: C, prepResult: PrepRes, execResult: ExecRes): Action | Promise<Action>;

  /**
   * Fallback execution if all retries of exec() fail
   * 
   * @param input - The result from prep() phase
   * @param error - The final error that caused exec() to fail
   * @returns Fallback result to use as execResult
   */
  fallback?(this: C, input: PrepRes, error: Error): ExecRes | Promise<ExecRes>;

  /**
   * Retry configuration for this node
   */
  retryConfig?: RetryConfig;
}

/**
 * Node execution result containing the action and any metadata
 */
export interface NodeResult {
  action: Action;
  execResult?: any;
  error?: Error;
  retryCount?: number;
}

/**
 * Transition configuration mapping actions to target nodes
 */
export type TransitionMap<C extends BaseContext = BaseContext> = {
  [action: string]: Node<C> | string;
};

/**
 * Flow configuration options
 */
export interface FlowConfig<C extends BaseContext = BaseContext> {
  startNode?: Node<C>;
  transitions?: Map<Node<C> | string, TransitionMap<C>>;
  defaultAction?: string;
  errorHandler?: (error: Error, node: Node<C>, context: C) => Action | Promise<Action>;
  maxExecutionTime?: number; // milliseconds
  contextProxyConfig?: ContextProxyConfig;
}

/**
 * Flow execution result
 */
export interface FlowResult<C extends BaseContext = BaseContext> {
  success: boolean;
  finalContext: C;
  executedNodes: Array<{ node: Node<C>; action: Action; timestamp: number }>;
  error?: Error;
  executionTime: number;
  contextChanges?: ContextChange[];
  changesSummary?: {
    totalChanges: number;
    keysModified: string[];
    readOnlyViolations: string[];
  };
}

/**
 * Interface for nodes that can run in parallel batches
 * When prep() returns an array, exec() will be called for each item in parallel
 */
export interface BatchNode<C extends BaseContext = BaseContext, PrepItem = any, ExecRes = any> 
  extends Omit<Node<C, PrepItem[], ExecRes[]>, 'exec'> {
  
  /**
   * Execution phase for batch processing
   * Called once for each item in the array returned by prep()
   * 
   * @param item - Single item from the prep() array
   * @returns Result for this item
   */
  exec(this: C, item: PrepItem): ExecRes | Promise<ExecRes>;
}

/**
 * Parallel execution configuration
 */
export interface ParallelConfig {
  concurrency?: number; // Max concurrent executions
  failFast?: boolean; // Stop on first error
  timeout?: number; // Timeout for parallel operations in milliseconds
}

/**
 * Node factory function type for dynamic node creation
 */
export type NodeFactory<C extends BaseContext = BaseContext> = (context: C) => Node<C>;

/**
 * Flow builder interface for fluent API
 */
export interface FlowBuilder<C extends BaseContext = BaseContext> {
  from(node: Node<C>): FlowBuilder<C>;
  to(node: Node<C>): FlowBuilder<C>;
  on(action: string): FlowBuilder<C>;
  parallel(nodes: Node<C>[]): FlowBuilder<C>;
  build(): Flow<C>;
}

/**
 * Main Flow interface
 */
export interface Flow<C extends BaseContext = BaseContext> extends Node<C> {
  /**
   * Add a node transition to the flow
   */
  connect(fromNode: Node<C> | string, action: string, toNode: Node<C> | string): void;

  /**
   * Run the flow with the given context
   */
  run(context: C): Promise<FlowResult<C>>;

  /**
   * Get a builder for fluent flow construction
   */
  builder(): FlowBuilder<C>;
}

/**
 * Utility type for extracting context type from a node
 */
export type NodeContext<T> = T extends Node<infer C> ? C : never;

/**
 * Utility type for creating strongly typed node implementations
 */
export type TypedNode<C extends BaseContext, PrepRes = any, ExecRes = any> = 
  Required<Pick<Node<C, PrepRes, ExecRes>, 'prep' | 'exec' | 'next'>> & 
  Partial<Pick<Node<C, PrepRes, ExecRes>, 'id' | 'fallback' | 'retryConfig'>>;
