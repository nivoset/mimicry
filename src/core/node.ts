/**
 * Core Node implementation with lifecycle management and error handling
 */

import { 
  Node, 
  BaseContext, 
  NodeResult, 
  Action, 
  RetryConfig, 
  BatchNode,
  ParallelConfig 
} from './types.js';

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 0,
  retryDelay: 1000,
  exponentialBackoff: false,
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Base Node runner that handles the prep/exec/next lifecycle
 */
export class NodeRunner {
  /**
   * Execute a node with full lifecycle management
   */
  static async run<C extends BaseContext>(
    node: Node<C>, 
    context: C
  ): Promise<NodeResult> {
    const startTime = Date.now();
    let retryCount = 0;
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...node.retryConfig };

    try {
      // Prep phase - bind context as 'this'
      const prepResult = node.prep ? await node.prep.call(context) : undefined;

      // Exec phase with retry logic
      let execResult: any;
      let lastError: Error | undefined;

      while (retryCount <= retryConfig.maxRetries) {
        try {
          if (node.exec) {
            // Check if this is a batch node (prep returned array)
            if (Array.isArray(prepResult) && NodeRunner.isBatchNode(node)) {
              execResult = await NodeRunner.executeBatch(
                node as BatchNode<C>,
                context,
                prepResult
              );
            } else {
              execResult = await node.exec.call(context, prepResult);
            }
          }
          lastError = undefined;
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as Error;
          retryCount++;

          if (retryCount <= retryConfig.maxRetries) {
            const delay = retryConfig.exponentialBackoff 
              ? retryConfig.retryDelay * Math.pow(2, retryCount - 1)
              : retryConfig.retryDelay;
            
            await sleep(delay);
          }
        }
      }

      // If all retries failed, try fallback
      if (lastError && node.fallback) {
        try {
          execResult = await node.fallback.call(context, prepResult, lastError);
          lastError = undefined; // Fallback succeeded
        } catch (fallbackError) {
          lastError = fallbackError as Error;
        }
      }

      // If we still have an error, throw it
      if (lastError) {
        throw lastError;
      }

      // Next phase - bind context as 'this'
      const action = node.next ? await node.next.call(context, prepResult, execResult) : undefined;

      return {
        action,
        execResult,
        retryCount: retryCount - 1, // Adjust for final increment
      };

    } catch (error) {
      return {
        action: undefined,
        error: error as Error,
        retryCount,
      };
    }
  }

  /**
   * Execute a batch node with parallel processing
   */
  private static async executeBatch<C extends BaseContext>(
    node: BatchNode<C>,
    context: C,
    items: any[],
    config: ParallelConfig = {}
  ): Promise<any[]> {
    const { 
      concurrency = items.length, 
      failFast = false, 
      timeout = 30000 
    } = config;

    // For unlimited concurrency or small arrays, use Promise.all
    if (concurrency >= items.length) {
      const promises = items.map(item => {
        const promise = node.exec.call(context, item);
        return timeout > 0 ? NodeRunner.withTimeout(promise, timeout) : promise;
      });

      if (failFast) {
        return Promise.all(promises);
      } else {
        return NodeRunner.settleAll(promises);
      }
    }

    // For limited concurrency, use a semaphore approach
    return NodeRunner.executeConcurrently(
      items,
      item => {
        const promise = node.exec.call(context, item);
        return timeout > 0 ? NodeRunner.withTimeout(promise, timeout) : promise;
      },
      concurrency,
      failFast
    );
  }

  /**
   * Execute promises with limited concurrency
   */
  private static async executeConcurrently<T, R>(
    items: T[],
    executor: (item: T) => Promise<R>,
    concurrency: number,
    failFast: boolean
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    const errors: Error[] = [];
    let index = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        const currentIndex = index++;
        const item = items[currentIndex];

        try {
          results[currentIndex] = await executor(item);
        } catch (error) {
          if (failFast) {
            throw error;
          }
          errors.push(error as Error);
          results[currentIndex] = undefined as any; // Will be filtered out if needed
        }
      }
    });

    await Promise.all(workers);

    if (errors.length > 0 && failFast) {
      throw errors[0];
    }

    return results;
  }

  /**
   * Execute promises and collect both successful and failed results
   */
  private static async settleAll<T>(promises: Promise<T>[]): Promise<T[]> {
    const results = await Promise.allSettled(promises);
    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // In a real implementation, you might want to handle errors differently
        // For now, we'll return undefined for failed promises
        return undefined as any;
      }
    });
  }

  /**
   * Add timeout to a promise
   */
  private static withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    // Disable timeouts in test environment
    if (process.env.NODE_ENV === 'test') {
      return promise;
    }
    
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Type guard to check if a node is a batch node
   */
  private static isBatchNode<C extends BaseContext>(node: Node<C>): node is BatchNode<C> {
    // In a real implementation, this might check for a specific interface or property
    // For now, we'll assume any node that receives an array in prep is a batch node
    return true; // This will be handled by the array check in the calling code
  }
}

/**
 * Utility class for creating common node patterns
 */
export class NodeFactory {
  /**
   * Create a simple node with just an exec function
   */
  static simple<C extends BaseContext, ExecRes = any>(
    id: string,
    execFn: (this: C) => ExecRes | Promise<ExecRes>
  ): Node<C, void, ExecRes> {
    return {
      id,
      exec: execFn,
    };
  }

  /**
   * Create a node with prep and exec phases
   */
  static withPrep<C extends BaseContext, PrepRes = any, ExecRes = any>(
    id: string,
    prepFn: (this: C) => PrepRes | Promise<PrepRes>,
    execFn: (this: C, input: PrepRes) => ExecRes | Promise<ExecRes>
  ): Node<C, PrepRes, ExecRes> {
    return {
      id,
      prep: prepFn,
      exec: execFn,
    };
  }

  /**
   * Create a routing node that only determines next action
   */
  static router<C extends BaseContext>(
    id: string,
    routeFn: (this: C) => Action | Promise<Action>
  ): Node<C, void, void> {
    return {
      id,
      next: routeFn,
    };
  }

  /**
   * Create a batch processing node
   */
  static batch<C extends BaseContext, PrepItem = any, ExecRes = any>(
    id: string,
    prepFn: (this: C) => PrepItem[] | Promise<PrepItem[]>,
    execFn: (this: C, item: PrepItem) => ExecRes | Promise<ExecRes>,
    nextFn?: (this: C, prepResult: PrepItem[], execResults: ExecRes[]) => Action | Promise<Action>
  ): BatchNode<C, PrepItem, ExecRes> {
    return {
      id,
      prep: prepFn,
      exec: execFn,
      next: nextFn,
    };
  }

  /**
   * Create a node with retry configuration
   */
  static withRetry<C extends BaseContext, PrepRes = any, ExecRes = any>(
    baseNode: Node<C, PrepRes, ExecRes>,
    retryConfig: RetryConfig
  ): Node<C, PrepRes, ExecRes> {
    return {
      ...baseNode,
      retryConfig: { ...DEFAULT_RETRY_CONFIG, ...retryConfig },
    };
  }

  /**
   * Create a node with fallback behavior
   */
  static withFallback<C extends BaseContext, PrepRes = any, ExecRes = any>(
    baseNode: Node<C, PrepRes, ExecRes>,
    fallbackFn: (this: C, input: PrepRes, error: Error) => ExecRes | Promise<ExecRes>
  ): Node<C, PrepRes, ExecRes> {
    return {
      ...baseNode,
      fallback: fallbackFn,
    };
  }
}

/**
 * Export the main runner function for convenient usage
 */
export const runNode = NodeRunner.run;
