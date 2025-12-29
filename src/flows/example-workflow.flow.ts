/**
 * Sample flow file for plugin demonstration
 * This file would be auto-discovered by the esbuild plugin
 */

import { QuickStart, NodeFactory, BaseContext } from '../index.js';

interface ExampleContext extends BaseContext {
  input: string;
  processed?: string;
  result?: string;
}

// Define nodes
const preprocessNode = NodeFactory.simple<ExampleContext, string>(
  'preprocess',
  function(this: ExampleContext) {
    return this.input.toLowerCase().trim();
  }
);

preprocessNode.next = function(this: ExampleContext, prepResult: void, execResult: string) {
  this.processed = execResult;
  return undefined;
};

const processNode = NodeFactory.withPrep<ExampleContext, string, string>(
  'process',
  function(this: ExampleContext) {
    return this.processed || '';
  },
  function(this: ExampleContext, input: string) {
    return `Processed: ${input.toUpperCase()}`;
  }
);

processNode.next = function(this: ExampleContext, input: string, result: string) {
  this.result = result;
  return undefined;
};

// Create the flow
export const exampleWorkflowFlow = QuickStart.sequential<ExampleContext>(
  preprocessNode,
  processNode
);

// Set flow ID for plugin discovery
exampleWorkflowFlow.id = 'exampleWorkflow';

export default exampleWorkflowFlow;
