/**
 * Utility functions and helpers for the workflow system
 */

import { Node, BaseContext, Action } from '../core/types.js';

/**
 * Deep clone an object (simple implementation for contexts)
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as any;
  }
  
  if (typeof obj === 'object') {
    const cloned = {} as any;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  
  return obj;
}

/**
 * Merge multiple contexts into one
 */
export function mergeContexts<C extends BaseContext>(...contexts: Partial<C>[]): C {
  return Object.assign({}, ...contexts) as C;
}

/**
 * Create a context partition for parallel execution
 */
export function partitionContext<C extends BaseContext>(
  context: C, 
  keys: (keyof C)[]
): { shared: Partial<C>; isolated: Partial<C> } {
  const shared: Partial<C> = {};
  const isolated: Partial<C> = {};
  
  for (const key in context) {
    if (keys.includes(key)) {
      isolated[key] = context[key];
    } else {
      shared[key] = context[key];
    }
  }
  
  return { shared, isolated };
}

/**
 * Type-safe context validator
 */
export function validateContext<C extends BaseContext>(
  context: any,
  requiredKeys: (keyof C)[]
): context is C {
  if (!context || typeof context !== 'object') {
    return false;
  }
  
  return requiredKeys.every(key => key in context);
}

/**
 * Create a conditional node that branches based on a predicate
 */
export function createConditionalNode<C extends BaseContext>(
  id: string,
  condition: (this: C) => boolean | Promise<boolean>,
  trueAction: string,
  falseAction: string
): Node<C, boolean, boolean> {
  return {
    id,
    async prep(this: C): Promise<boolean> {
      return await condition.call(this);
    },
    exec(this: C, condition: boolean): boolean {
      return condition;
    },
    next(this: C, prepResult: boolean, execResult: boolean): Action {
      return execResult ? trueAction : falseAction;
    }
  };
}

/**
 * Create a data transformation node
 */
export function createTransformNode<C extends BaseContext, T, R>(
  id: string,
  selector: (this: C) => T,
  transformer: (input: T) => R | Promise<R>,
  updater: (this: C, result: R) => void
): Node<C, T, R> {
  return {
    id,
    prep(this: C): T {
      return selector.call(this);
    },
    async exec(this: C, input: T): Promise<R> {
      return await transformer(input);
    },
    next(this: C, prepResult: T, execResult: R): Action {
      updater.call(this, execResult);
      return undefined; // Default action
    }
  };
}

/**
 * Create a delay node for flow pacing
 */
export function createDelayNode<C extends BaseContext>(
  id: string,
  delayMs: number | ((this: C) => number)
): Node<C, number, void> {
  return {
    id,
    prep(this: C): number {
      return typeof delayMs === 'function' ? delayMs.call(this) : delayMs;
    },
    async exec(this: C, delay: number): Promise<void> {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  };
}

/**
 * Create a logging node for debugging flows
 */
export function createLogNode<C extends BaseContext>(
  id: string,
  message: string | ((this: C) => string),
  level: 'info' | 'warn' | 'error' = 'info'
): Node<C, string, void> {
  return {
    id,
    prep(this: C): string {
      return typeof message === 'function' ? message.call(this) : message;
    },
    exec(this: C, msg: string): void {
      console[level](`[${id}] ${msg}`);
    }
  };
}

/**
 * Create a node that saves data to context
 */
export function createSaveNode<C extends BaseContext, T>(
  id: string,
  key: keyof C,
  value: T | ((this: C) => T | Promise<T>)
): Node<C, T, T> {
  return {
    id,
    async prep(this: C): Promise<T> {
      return typeof value === 'function' 
        ? await (value as Function).call(this)
        : value;
    },
    exec(this: C, val: T): T {
      return val;
    },
    next(this: C, prepResult: T, execResult: T): Action {
      (this as any)[key] = execResult;
      return undefined;
    }
  };
}

/**
 * Create a node that loads data from external source
 */
export function createLoaderNode<C extends BaseContext, T>(
  id: string,
  loader: (this: C) => Promise<T>,
  key?: keyof C
): Node<C, void, T> {
  return {
    id,
    async exec(this: C): Promise<T> {
      return await loader.call(this);
    },
    next(this: C, prepResult: void, execResult: T): Action {
      if (key) {
        (this as any)[key] = execResult;
      }
      return undefined;
    }
  };
}

/**
 * Create an error boundary node that catches and handles errors
 */
export function createErrorBoundaryNode<C extends BaseContext>(
  id: string,
  wrappedNode: Node<C>,
  errorHandler: (this: C, error: Error) => Action | Promise<Action>,
  fallbackAction: Action = 'error'
): Node<C> {
  return {
    id,
    async prep(this: C) {
      return wrappedNode.prep ? await wrappedNode.prep.call(this) : undefined;
    },
    async exec(this: C, input: any) {
      try {
        return wrappedNode.exec ? await wrappedNode.exec.call(this, input) : undefined;
      } catch (error) {
        // Store error in context for handler
        (this as any).__lastError = error;
        return undefined;
      }
    },
    async next(this: C, prepResult: any, execResult: any): Promise<Action> {
      const error = (this as any).__lastError;
      if (error) {
        delete (this as any).__lastError;
        try {
          return await errorHandler.call(this, error);
        } catch (handlerError) {
          return fallbackAction;
        }
      }
      
      return wrappedNode.next ? await wrappedNode.next.call(this, prepResult, execResult) : undefined;
    }
  };
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private static timers = new Map<string, number>();
  
  static start(id: string): void {
    this.timers.set(id, performance.now());
  }
  
  static end(id: string): number {
    const start = this.timers.get(id);
    if (!start) {
      throw new Error(`No timer found for id: ${id}`);
    }
    
    const duration = performance.now() - start;
    this.timers.delete(id);
    return duration;
  }
  
  static createTimedNode<C extends BaseContext>(
    wrappedNode: Node<C>,
    onComplete?: (duration: number, nodeId?: string) => void
  ): Node<C> {
    const timerId = `node_${wrappedNode.id || 'anonymous'}_${Date.now()}`;
    
    return {
      ...wrappedNode,
      id: wrappedNode.id ? `timed_${wrappedNode.id}` : timerId,
      async prep(this: C) {
        PerformanceMonitor.start(timerId);
        return wrappedNode.prep ? await wrappedNode.prep.call(this) : undefined;
      },
      async exec(this: C, input: any) {
        return wrappedNode.exec ? await wrappedNode.exec.call(this, input) : undefined;
      },
      async next(this: C, prepResult: any, execResult: any) {
        const duration = PerformanceMonitor.end(timerId);
        if (onComplete) {
          onComplete(duration, wrappedNode.id);
        }
        return wrappedNode.next ? await wrappedNode.next.call(this, prepResult, execResult) : undefined;
      }
    };
  }
}

/**
 * Context debugging utilities
 */
export function debugContext<C extends BaseContext>(context: C, label?: string): void {
  console.group(label || 'Context Debug');
  console.table(context);
  console.groupEnd();
}

/**
 * Advanced context debugging with change tracking
 */
export function debugContextWithChanges<C extends BaseContext>(
  context: C, 
  changes: import('../core/types.js').ContextChange[] = [],
  label?: string
): void {
  console.group(label || 'Context Debug with Changes');
  
  console.log('📋 Current Context:');
  console.table(context);
  
  if (changes.length > 0) {
    console.log('\n🔄 Recent Changes:');
    changes.slice(-10).forEach((change, index) => {
      const timestamp = new Date(change.timestamp).toISOString();
      console.log(`${index + 1}. [${timestamp}] ${change.operation} '${change.key}':`, 
                  change.oldValue, '->', change.newValue);
    });
    
    console.log(`\n📊 Total changes: ${changes.length}`);
    console.log('🔑 Keys modified:', [...new Set(changes.map(c => c.key))]);
  }
  
  console.groupEnd();
}

/**
 * Compare two contexts and show differences
 */
export function debugContextDiff<C extends BaseContext>(
  context1: C, 
  context2: C, 
  label1 = 'Context 1', 
  label2 = 'Context 2'
): void {
  console.group('Context Comparison');
  
  const keys1 = Object.keys(context1);
  const keys2 = Object.keys(context2);
  const allKeys = [...new Set([...keys1, ...keys2])];
  
  const differences: Array<{key: string, context1: any, context2: any, status: string}> = [];
  
  for (const key of allKeys) {
    const val1 = context1[key];
    const val2 = context2[key];
    
    if (!(key in context1)) {
      differences.push({ key, context1: '(missing)', context2: val2, status: 'only in ' + label2 });
    } else if (!(key in context2)) {
      differences.push({ key, context1: val1, context2: '(missing)', status: 'only in ' + label1 });
    } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      differences.push({ key, context1: val1, context2: val2, status: 'different' });
    }
  }
  
  if (differences.length === 0) {
    console.log('✅ Contexts are identical');
  } else {
    console.log(`⚠️  Found ${differences.length} differences:`);
    console.table(differences);
  }
  
  console.groupEnd();
}

/**
 * Flow visualization helper (simple text-based)
 */
export function visualizeFlow<C extends BaseContext>(
  nodes: Node<C>[],
  transitions: Map<Node<C> | string, any>
): string {
  let output = 'Flow Visualization:\n';
  
  nodes.forEach(node => {
    const nodeId = node.id || 'anonymous';
    output += `\n[${nodeId}]`;
    
    const nodeTransitions = transitions.get(node);
    if (nodeTransitions) {
      Object.entries(nodeTransitions).forEach(([action, target]) => {
        const targetId = typeof target === 'string' ? target : (target as Node<C>).id || 'anonymous';
        output += `\n  --${action}-> [${targetId}]`;
      });
    }
  });
  
  return output;
}
