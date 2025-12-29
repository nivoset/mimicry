/**
 * Minimal flow example function
 */

import { Page } from '@playwright/test';
import { z } from 'zod';
import { createFlow } from './core/flow.js';
import { NodeFactory } from './core/node.js';
import { BaseContext, Node } from './core/types.js';
import type { LanguageModel } from 'ai';
import { getBaseAction } from './mimic/actionType.js';
import { getNavigationAction, getNavigationUrl, executeNavigationAction } from './mimic/navigation.js';
import { buildSelectorForTarget, captureTargets, TargetInfo } from './mimic/selector.js';
import { getClickAction } from './mimic/click.js';

/**
 * Context interface for the minimal flow example
 */
interface MimicContext extends BaseContext {
  input: string;
  processed?: string;
  result?: string;
}

/**
 * Zod schema for validating the initial context
 */
const InitialContextSchema = z.object({
  input: z.string().min(1, 'Input must not be empty'),
});

/**
 * Zod schema for validating the final context after flow execution
 */
const FinalContextSchema = z.object({
  input: z.string(),
  processed: z.string(),
  result: z.string(),
});

/**
 * Zod schema for validating flow execution results
 */
const FlowResultSchema = z.object({
  success: z.boolean(),
  finalContext: z.object({
    input: z.string(),
    processed: z.string(),
    result: z.string(),
  }),
  executedNodes: z.array(
    z.object({
      node: z.any(),
      action: z.union([z.string(), z.undefined()]),
      timestamp: z.number(),
    })
  ),
  executionTime: z.number().nonnegative(),
});

/**
 * Node 1: Process input - transforms input to lowercase and trims whitespace
 */
const processInputNode: Node<MimicContext> = NodeFactory.withPrep<MimicContext, string, string>(
  'processInput',
  function (this: MimicContext) {
    return this.input;
  },
  function (this: MimicContext, input: string) {
    return input.toLowerCase().trim();
  }
);

processInputNode.next = function (this: MimicContext, _prepResult: string, execResult: string) {
  this.processed = execResult;
  return undefined;
};

/**
 * Node 2: Transform processed data - adds prefix to processed string
 */
const transformNode: Node<MimicContext> = NodeFactory.withPrep<MimicContext, string, string>(
  'transform',
  function (this: MimicContext) {
    return this.processed || '';
  },
  function (this: MimicContext, input: string) {
    return `Processed: ${input.toUpperCase()}`;
  }
);

transformNode.next = function (this: MimicContext, _prepResult: string, execResult: string) {
  this.result = execResult;
  return undefined;
};

/**
 * Create the minimal flow
 */
const mimicFlow = createFlow<MimicContext>({
  startNode: processInputNode,
});

// Connect nodes sequentially
mimicFlow.connect(processInputNode, 'default', transformNode);

/**
 * Minimal flow function that takes a Playwright page and input string
 * 
 * @param page - Playwright Page object
 * @param input - Input string to process
 * @returns Flow execution result with validated context
 */
export async function mimic(_page: Page, _brain: LanguageModel, input: string) {
  // Validate input with Zod
  const validatedInput = InitialContextSchema.parse({ input });

  const steps = input.split('\n')
    // lets clean up things
    .map(step => step.trim())
    // and remove empty steps
    .filter(step => step.length > 0);

  // now lets process each step
  for (const step of steps) {

    const baseAction = await getBaseAction(_page, _brain, step);
    switch (baseAction.kind) {
      case 'navigation':
        const navigationAction = await getNavigationAction(_page, _brain, step);
        // If navigation type is "navigate", extract the URL separately
        let url: string | undefined;
        if (navigationAction.type === 'navigate') {
          const urlResult = await getNavigationUrl(_page, _brain, step);
          url = urlResult.url;
        }
        await executeNavigationAction(_page, navigationAction, url);
        break;
      case 'click':
        const targetElements = await captureTargets(_page, { interactableOnly: true });
        const clickActionResult = await getClickAction(_page, _brain, step, targetElements);

        const clickable = await buildSelectorForTarget(_page, clickActionResult.candidates.find(Boolean) as any);
        await clickable?.click();
        
        break;
      case 'form update':
        console.error('Form update not implemented yet');
        const formElements = await captureTargets(_page, { interactableOnly: true });
        console.log(`Form element count: ${formElements.length}`);
        break;
      default:
        throw new Error(`Unknown base action type: ${baseAction.kind}`);
    }
  }
  // 
  // Create initial context
  const initialContext: MimicContext = {
    input: validatedInput.input,
  };

  // Execute the flow
  const result = await mimicFlow.run(initialContext);

  // Validate flow result structure with Zod
  const validatedResult = FlowResultSchema.parse(result);

  // Validate final context with Zod
  const validatedFinalContext = FinalContextSchema.parse(result.finalContext);

  return {
    success: validatedResult.success,
    finalContext: validatedFinalContext,
    executedNodes: validatedResult.executedNodes,
    executionTime: validatedResult.executionTime,
  };
}
