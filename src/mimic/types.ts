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
 * Complete snapshot of a test execution
 */
export interface Snapshot {
  /** Hash identifier for this test */
  testHash: string;
  /** Original test text (mimic template string) */
  testText: string;
  /** When this snapshot was first created */
  createdAt: string;
  /** When the test last passed (ISO timestamp) */
  lastPassedAt: string | null;
  /** When the test last failed (ISO timestamp, null if never failed) */
  lastFailedAt: string | null;
  /** Array of executed steps */
  steps: SnapshotStep[];
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
