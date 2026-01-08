/**
 * Snapshot-related Type Definitions
 * 
 * Types for storing and replaying test execution snapshots.
 */

import type { NavigationAction } from './schema/action.js';
import type { ClickActionResult } from './schema/action.js';
import type { FormActionResult } from './forms.js';
import type { TargetInfo } from './selector.js';

/**
 * A single step in a test execution snapshot
 */
export interface SnapshotStep {
  /** Hash of the step text for identification */
  stepHash: string;
  /** Index of the step in the test (0-based) */
  stepIndex: number;
  /** Original step text (Gherkin step) */
  stepText: string;
  /** Type of action (navigation, click, form update) */
  actionKind: 'navigation' | 'click' | 'form update';
  /** Full action details (varies by actionKind) */
  actionDetails: NavigationAction | ClickActionResult | FormActionResult;
  /** Target element information (for click and form actions) */
  targetElement?: TargetInfo & { selector?: string };
  /** Timestamp when this step was executed */
  executedAt: string;
}

/**
 * Flags for test execution metadata and configuration
 */
export interface SnapshotFlags {
  /** Metadata flags */
  needsRetry: boolean;
  hasErrors: boolean;
  troubleshootingEnabled: boolean;
  /** Configuration flags */
  skipSnapshot: boolean;
  forceRegenerate: boolean;
  debugMode: boolean;
  /** Timestamps */
  createdAt: string;
  lastPassedAt: string | null;
  lastFailedAt: string | null;
}

/**
 * Complete snapshot of a test execution
 */
export interface Snapshot {
  /** Hash identifier for this test */
  testHash: string;
  /** Original test text (mimic template string) */
  testText: string;
  /** Array of executed steps */
  steps: SnapshotStep[];
  /** Flags for troubleshooting and configuration */
  flags: SnapshotFlags;
}

/**
 * Result of executing a single step (for snapshot creation)
 */
export interface StepExecutionResult {
  /** Index of the step in the test (0-based) */
  stepIndex: number;
  /** Original step text (Gherkin step) */
  stepText: string;
  /** Type of action (navigation, click, form update) */
  actionKind: 'navigation' | 'click' | 'form update';
  /** Full action details (varies by actionKind) */
  actionDetails: NavigationAction | ClickActionResult | FormActionResult;
  /** Target element information (for click and form actions) */
  targetElement?: TargetInfo & { selector?: string };
}
