/**
 * PocketFlow TypeScript - A workflow orchestration framework inspired by PocketFlow
 * 
 * Main entry point exporting all public APIs
 */

// Core types and interfaces
export * from './core/types.js';

// Node implementation and utilities
export * from './core/node.js';

// Flow orchestration
export * from './core/flow.js';

// Utility functions and helpers
export * from './utils/helpers.js';

// Context proxy functionality
export * from './core/context-proxy.js';

// Re-export main classes for convenience
export { Pipeline as Flow } from './core/flow.js';
export { NodeRunner, NodeFactory } from './core/node.js';

/**
 * Quick start factory functions
 */
import { Pipeline, createFlow, flow } from './core/flow.js';
import { NodeFactory } from './core/node.js';
import { BaseContext } from './core/types.js';

export const QuickStart = {
  /**
   * Create a new flow
   */
  createFlow,
  
  /**
   * Create a flow builder
   */
  flow,
  
  /**
   * Node factory for common patterns
   */
  node: NodeFactory,
  
  /**
   * Create a simple sequential flow from nodes
   */
  sequential<C extends BaseContext>(...nodes: Array<import('./core/types.js').Node<C>>): Pipeline<C> {
    const f = new Pipeline<C>();
    
    if (nodes.length === 0) {
      throw new Error('At least one node is required for sequential flow');
    }
    
    f.setStartNode(nodes[0]);
    
    for (let i = 0; i < nodes.length - 1; i++) {
      f.connect(nodes[i], 'default', nodes[i + 1]);
    }
    
    return f;
  },
  
  /**
   * Create a parallel flow from nodes
   */
  parallel<C extends BaseContext>(
    nodes: Array<import('./core/types.js').Node<C>>, 
    config?: import('./core/types.js').ParallelConfig
  ): import('./core/types.js').Node<C> {
    return Pipeline.parallel(nodes, config);
  }
};

/**
 * Version information
 */
export const VERSION = '1.0.0';

/**
 * Default export for CommonJS compatibility
 */
export default {
  QuickStart,
  Flow: Pipeline,
  NodeFactory,
  createFlow,
  flow,
  VERSION,
};
