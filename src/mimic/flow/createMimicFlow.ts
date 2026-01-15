/**
 * Create Mimic Flow
 * 
 * Factory function that creates and configures the PocketFlow flow for mimic test execution.
 * This flow orchestrates all the nodes to execute a test from start to finish.
 */

import { Flow } from 'pocketflow';
import type { MimicSharedState } from './types.js';
import { InitializeNode } from './nodes/InitializeNode.js';
import { SnapshotCheckNode } from './nodes/SnapshotCheckNode.js';
import { SnapshotReplayNode } from './nodes/SnapshotReplayNode.js';
import { InitialScreenshotNode } from './nodes/InitialScreenshotNode.js';
import { StepProcessorNode } from './nodes/StepProcessorNode.js';
import { ActionTypeNode } from './nodes/ActionTypeNode.js';
import { NavigationActionNode } from './nodes/NavigationActionNode.js';
import { ClickActionNode } from './nodes/ClickActionNode.js';
import { FormActionNode } from './nodes/FormActionNode.js';
import { IntentCheckNode } from './nodes/IntentCheckNode.js';
import { SnapshotSaveNode } from './nodes/SnapshotSaveNode.js';
import { TokenUsageNode } from './nodes/TokenUsageNode.js';

/**
 * Create and configure the mimic flow
 * 
 * Flow structure:
 * InitializeNode
 *   → SnapshotCheckNode
 *     → SnapshotReplayNode (if useSnapshot)
 *       → TokenUsageNode (if snapshotUsed) → END
 *     → InitialScreenshotNode (if !useSnapshot or replay failed)
 *       → StepProcessorNode (loop for each step)
 *         → ActionTypeNode
 *           → NavigationActionNode (if navigation)
 *           → ClickActionNode (if click)
 *           → FormActionNode (if form)
 *         → IntentCheckNode
 *           → ActionTypeNode (loop back if not accomplished)
 *           → StepProcessorNode (next step if accomplished)
 *       → SnapshotSaveNode
 *       → TokenUsageNode
 * 
 * @returns Configured Flow instance
 */
export function createMimicFlow(): Flow<MimicSharedState> {
  // Create all nodes
  const initializeNode = new InitializeNode();
  const snapshotCheckNode = new SnapshotCheckNode();
  const snapshotReplayNode = new SnapshotReplayNode();
  const initialScreenshotNode = new InitialScreenshotNode();
  const stepProcessorNode = new StepProcessorNode();
  const actionTypeNode = new ActionTypeNode();
  const navigationActionNode = new NavigationActionNode();
  const clickActionNode = new ClickActionNode();
  const formActionNode = new FormActionNode();
  const intentCheckNode = new IntentCheckNode();
  const snapshotSaveNode = new SnapshotSaveNode();
  const tokenUsageNode = new TokenUsageNode();

  // Build flow connections
  // Initialize → Snapshot Check
  initializeNode.next(snapshotCheckNode);

  // Snapshot Check routes:
  // - "replay" → Snapshot Replay
  // - "continue" → Initial Screenshot
  snapshotCheckNode.on('replay', snapshotReplayNode);
  snapshotCheckNode.on('continue', initialScreenshotNode);

  // Snapshot Replay routes:
  // - undefined (end) → Token Usage (if snapshot used)
  // - "continue" → Initial Screenshot (if replay failed)
  snapshotReplayNode.next(tokenUsageNode); // This will only execute if snapshot was used (returns undefined)
  snapshotReplayNode.on('continue', initialScreenshotNode);

  // Initial Screenshot → Step Processor
  initialScreenshotNode.next(stepProcessorNode);

  // Step Processor routes:
  // - "next" → Step Processor (next step)
  // - "complete" → Snapshot Save
  // - "regenerate" → Action Type
  stepProcessorNode.on('next', stepProcessorNode); // Loop for next step
  stepProcessorNode.on('complete', snapshotSaveNode);
  stepProcessorNode.on('regenerate', actionTypeNode);

  // Action Type routes:
  // - "navigation" → Navigation Action
  // - "click" → Click Action
  // - "form update" → Form Action
  actionTypeNode.on('navigation', navigationActionNode);
  actionTypeNode.on('click', clickActionNode);
  actionTypeNode.on('form update', formActionNode);

  // All action nodes → Intent Check
  navigationActionNode.next(intentCheckNode);
  clickActionNode.next(intentCheckNode);
  formActionNode.next(intentCheckNode);

  // Intent Check routes:
  // - "continue" → Action Type (not accomplished, try another action)
  // - "next" → Step Processor (accomplished, move to next step)
  // - "complete" → Snapshot Save (all steps done)
  intentCheckNode.on('continue', actionTypeNode); // Loop back for more actions
  intentCheckNode.on('next', stepProcessorNode); // Move to next step
  intentCheckNode.on('complete', snapshotSaveNode);

  // Snapshot Save → Token Usage
  snapshotSaveNode.next(tokenUsageNode);

  // Token Usage ends the flow (returns undefined)

  // Create flow starting with initialize node
  return new Flow<MimicSharedState>(initializeNode);
}
