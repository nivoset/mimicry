/**
 * Context Proxy System for tracking changes and providing isolation
 */

import { 
  BaseContext, 
  ContextChange, 
  ContextProxyConfig, 
  TrackedContext 
} from './types.js';

/**
 * Default configuration for context proxy
 */
const DEFAULT_CONFIG: Required<ContextProxyConfig> = {
  trackChanges: true,
  enableUndo: false,
  maxHistorySize: 100,
  readOnlyKeys: [],
  onChangeCallback: () => {},
  applyPartialChangesOnError: false,
};

/**
 * Context Proxy implementation that tracks all changes
 */
export class ContextProxy<C extends BaseContext = BaseContext> implements TrackedContext<C> {
  private originalContext: C;
  private config: Required<ContextProxyConfig>;
  private changeHistory: ContextChange[] = [];
  private isTracking = true;
  private snapshot: C;
  private readOnlyViolations: string[] = [];
  
  public context: C;
  public readonly = false;

  constructor(originalContext: C, config: ContextProxyConfig = {}) {
    this.originalContext = originalContext;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.snapshot = this.deepClone(originalContext);
    
    // Create proxy wrapper
    this.context = this.createProxy(originalContext);
  }

  /**
   * Create the proxy wrapper for the context
   */
  private createProxy(target: C): C {
    return new Proxy(target, {
      get: (obj, prop) => {
        const value = obj[prop as keyof C];
        return value;
      },

      set: (obj, prop, value) => {
        const key = String(prop);
        
        // Check if key is read-only
        if (this.config.readOnlyKeys.includes(key)) {
          this.readOnlyViolations.push(key);
          if (this.readonly) {
            console.warn(`Attempted to modify read-only property: ${key}`);
            return false;
          }
        }

        const oldValue = obj[prop as keyof C];
        const change: ContextChange = {
          key,
          oldValue: this.deepClone(oldValue),
          newValue: this.deepClone(value),
          timestamp: Date.now(),
          operation: prop in obj ? 'set' : 'define'
        };

        // Track the change
        if (this.isTracking && this.config.trackChanges) {
          this.addChange(change);
        }

        // Set the value
        obj[prop as keyof C] = value;

        // Trigger callback
        if (this.config.onChangeCallback) {
          this.config.onChangeCallback(change);
        }

        return true;
      },

      deleteProperty: (obj, prop) => {
        const key = String(prop);
        
        if (this.config.readOnlyKeys.includes(key)) {
          this.readOnlyViolations.push(key);
          if (this.readonly) {
            console.warn(`Attempted to delete read-only property: ${key}`);
            return false;
          }
        }

        const oldValue = obj[prop as keyof C];
        const change: ContextChange = {
          key,
          oldValue: this.deepClone(oldValue),
          newValue: undefined,
          timestamp: Date.now(),
          operation: 'delete'
        };

        if (this.isTracking && this.config.trackChanges) {
          this.addChange(change);
        }

        delete obj[prop as keyof C];

        if (this.config.onChangeCallback) {
          this.config.onChangeCallback(change);
        }

        return true;
      },

      has: (obj, prop) => {
        return prop in obj;
      },

      ownKeys: (obj) => {
        return Reflect.ownKeys(obj);
      },

      getOwnPropertyDescriptor: (obj, prop) => {
        return Reflect.getOwnPropertyDescriptor(obj, prop);
      }
    });
  }

  /**
   * Add change to history with size management
   */
  private addChange(change: ContextChange): void {
    this.changeHistory.push(change);
    
    // Manage history size
    if (this.changeHistory.length > this.config.maxHistorySize) {
      this.changeHistory.shift();
    }
  }

  /**
   * Deep clone utility
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as any;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as any;
    }
    
    if (typeof obj === 'object') {
      const cloned = {} as any;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
    
    return obj;
  }

  /**
   * Start tracking changes
   */
  startTracking(): void {
    this.isTracking = true;
  }

  /**
   * Stop tracking changes
   */
  stopTracking(): void {
    this.isTracking = false;
  }

  /**
   * Get all recorded changes
   */
  getChanges(): ContextChange[] {
    return [...this.changeHistory];
  }

  /**
   * Get changes since a specific timestamp
   */
  getChangesSince(timestamp: number): ContextChange[] {
    return this.changeHistory.filter(change => change.timestamp >= timestamp);
  }

  /**
   * Clear the change history
   */
  clearChanges(): void {
    this.changeHistory = [];
    this.readOnlyViolations = [];
  }

  /**
   * Apply all tracked changes to a target context
   */
  applyChanges(targetContext: C): void {
    for (const change of this.changeHistory) {
      switch (change.operation) {
        case 'set':
        case 'define':
          (targetContext as any)[change.key] = this.deepClone(change.newValue);
          break;
        case 'delete':
          delete (targetContext as any)[change.key];
          break;
      }
    }
  }

  /**
   * Apply specific changes to a target context
   */
  applySpecificChanges(targetContext: C, changes: ContextChange[]): void {
    for (const change of changes) {
      switch (change.operation) {
        case 'set':
        case 'define':
          (targetContext as any)[change.key] = this.deepClone(change.newValue);
          break;
        case 'delete':
          delete (targetContext as any)[change.key];
          break;
      }
    }
  }

  /**
   * Revert all changes back to the original snapshot
   */
  revertChanges(): void {
    // Clear current context and restore from snapshot
    for (const key in this.context) {
      delete this.context[key];
    }
    
    Object.assign(this.context, this.deepClone(this.snapshot));
    this.clearChanges();
  }

  /**
   * Create a snapshot of the current context state
   */
  createSnapshot(): C {
    return this.deepClone(this.context);
  }

  /**
   * Get changes grouped by key
   */
  getChangesByKey(): Record<string, ContextChange[]> {
    const grouped: Record<string, ContextChange[]> = {};
    
    for (const change of this.changeHistory) {
      if (!grouped[change.key]) {
        grouped[change.key] = [];
      }
      grouped[change.key].push(change);
    }
    
    return grouped;
  }

  /**
   * Get summary of changes
   */
  getChangesSummary() {
    const keysModified = [...new Set(this.changeHistory.map(c => c.key))];
    
    return {
      totalChanges: this.changeHistory.length,
      keysModified,
      readOnlyViolations: [...this.readOnlyViolations],
      lastChange: this.changeHistory[this.changeHistory.length - 1]?.timestamp,
      tracking: this.isTracking
    };
  }

  /**
   * Create a diff between current context and original
   */
  createDiff(): Record<string, { from: any; to: any; operation: string }> {
    const diff: Record<string, { from: any; to: any; operation: string }> = {};
    
    // Check for changes and additions
    for (const key in this.context) {
      const currentValue = this.context[key];
      const originalValue = this.snapshot[key];
      
      if (!this.deepEqual(currentValue, originalValue)) {
        diff[key] = {
          from: this.deepClone(originalValue),
          to: this.deepClone(currentValue),
          operation: key in this.snapshot ? 'modified' : 'added'
        };
      }
    }
    
    // Check for deletions
    for (const key in this.snapshot) {
      if (!(key in this.context)) {
        diff[key] = {
          from: this.deepClone(this.snapshot[key]),
          to: undefined,
          operation: 'deleted'
        };
      }
    }
    
    return diff;
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    
    if (a == null || b == null) return a === b;
    
    if (typeof a !== typeof b) return false;
    
    if (typeof a !== 'object') return a === b;
    
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }
    
    return true;
  }

  /**
   * Set readonly mode
   */
  setReadOnly(readonly: boolean): void {
    this.readonly = readonly;
  }

  /**
   * Get read-only violations
   */
  getReadOnlyViolations(): string[] {
    return [...this.readOnlyViolations];
  }

  /**
   * Create an isolated copy for parallel execution
   */
  createIsolatedCopy(): ContextProxy<C> {
    const copy = new ContextProxy(this.deepClone(this.context), this.config);
    return copy;
  }

  /**
   * Merge changes from another context proxy
   */
  mergeChanges(otherProxy: ContextProxy<C>, conflictResolution: 'ours' | 'theirs' | 'merge' = 'theirs'): void {
    const otherChanges = otherProxy.getChanges();
    const ourChangesByKey = this.getChangesByKey();
    
    for (const change of otherChanges) {
      const hasConflict = ourChangesByKey[change.key] && 
                         ourChangesByKey[change.key].some(c => c.timestamp > change.timestamp);
      
      if (!hasConflict || conflictResolution === 'theirs') {
        // Apply the change
        switch (change.operation) {
          case 'set':
          case 'define':
            (this.context as any)[change.key] = this.deepClone(change.newValue);
            break;
          case 'delete':
            delete (this.context as any)[change.key];
            break;
        }
        
        this.addChange(change);
      }
      // 'ours' means we keep our changes, 'merge' would need custom logic
    }
  }

  /**
   * Export changes as JSON
   */
  exportChanges(): string {
    return JSON.stringify({
      changes: this.changeHistory,
      summary: this.getChangesSummary(),
      snapshot: this.snapshot
    }, null, 2);
  }

  /**
   * Import changes from JSON
   */
  importChanges(json: string): void {
    try {
      const data = JSON.parse(json);
      this.changeHistory = data.changes || [];
      if (data.snapshot) {
        this.snapshot = data.snapshot;
      }
    } catch (error) {
      throw new Error(`Failed to import changes: ${error}`);
    }
  }

  /**
   * Get access to the raw changes array
   */
  get changes(): ContextChange[] {
    return this.changeHistory;
  }
}

/**
 * Factory function to create a tracked context
 */
export function createTrackedContext<C extends BaseContext>(
  context: C, 
  config?: ContextProxyConfig
): ContextProxy<C> {
  return new ContextProxy(context, config);
}

/**
 * Utility to compare two contexts and get differences
 */
export function compareContexts<C extends BaseContext>(
  context1: C, 
  context2: C
): Record<string, { from: any; to: any; operation: string }> {
  const proxy = new ContextProxy(context1);
  Object.assign(proxy.context, context2);
  return proxy.createDiff();
}
