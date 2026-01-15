/**
 * PocketFlow Shared State Types for Mimic
 * 
 * Defines the shared state interface used by all nodes in the mimic flow.
 * This state is passed between nodes and allows them to communicate and
 * coordinate the test execution process.
 */

import type { Page, TestInfo } from '@playwright/test';
import type { LanguageModel } from 'ai';
import type { Snapshot, SnapshotStep } from '../types.js';
import type { StepExecutionResult, TestContext } from '../../mimic.js';

/**
 * Shared state interface for the mimic flow
 * 
 * This state is shared across all nodes in the flow and contains all
 * information needed for test execution, snapshot management, and result tracking.
 */
export interface MimicSharedState {
  /** Original test input string (mimic template string) */
  input: string;
  
  /** Parsed step array (one step per line) */
  steps: string[];
  
  /** Hash of test input for snapshot identification */
  testHash: string;
  
  /** Test case name for token tracking */
  testCaseName?: string;
  
  /** Playwright TestInfo object for annotations and attachments */
  testInfo?: TestInfo;
  
  /** Path to test file for snapshot storage */
  testFilePath?: string;
  
  /** Whether troubleshoot mode is enabled */
  troubleshootMode: boolean;
  
  /** Whether snapshot replay was used (for token usage reporting) */
  snapshotUsed: boolean;
  
  /** Loaded snapshot (if any exists) */
  existingSnapshot: Snapshot | null;
  
  /** Map of cached steps by hash for selective regeneration */
  existingStepsByHash: Record<string, SnapshotStep>;
  
  /** Array of completed step execution results */
  executedSteps: StepExecutionResult[];
  
  /** Current step index being processed (0-based) */
  currentStepIndex: number;
  
  /** Total number of steps expected */
  expectedStepCount: number;
  
  /** Whether to use full snapshot replay */
  useSnapshot: boolean;
  
  /** Playwright Page object */
  page: Page;
  
  /** Language model for AI operations */
  brains: LanguageModel;
  
  /** Test context for action decision-making */
  testContext?: TestContext;
  
  /** Current action type being executed */
  currentActionType?: 'navigation' | 'click' | 'form update';
  
  /** Actions taken for current step (for intent checking) */
  currentStepActions: StepExecutionResult[];
  
  /** Whether current step intent is accomplished */
  intentAccomplished: boolean;
  
  /** Action count for current step (to prevent infinite loops) */
  actionCount: number;
  
  /** Maximum actions per step */
  maxActionsPerStep: number;
}
