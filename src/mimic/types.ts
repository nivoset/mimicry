/**
 * Snapshot-related Type Definitions
 * 
 * Types for storing and replaying test execution snapshots.
 */

import type { NavigationAction } from './schema/action.js';
import type { ClickActionResult } from './schema/action.js';
import type { FormActionResult } from './forms.js';
import type { AssertionActionResult } from './assertions.js';
import type { SelectorDescriptor, PlaywrightLocatorJson } from './selectorTypes.js';

/**
 * Target element information using best selector with mimicId fallback
 */
export interface MarkerTargetElement {
  /** The best selector descriptor for the element (primary) - supports both legacy and Playwright formats */
  selector: SelectorDescriptor | PlaywrightLocatorJson;
  /** Selector format indicator - 'legacy' for SelectorDescriptor, 'playwright' for PlaywrightLocatorJson */
  selectorFormat?: 'legacy' | 'playwright';
  /** The mimic ID assigned to the element by the markers system (fallback) */
  mimicId: number;
}

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
  /** Type of action (navigation, click, form update, assertion) */
  actionKind: 'navigation' | 'click' | 'form update' | 'assertion';
  /** Full action details (varies by actionKind) */
  actionDetails: NavigationAction | ClickActionResult | FormActionResult | AssertionActionResult;
  /** Target element information using marker ID (for click, form, and assertion actions) */
  targetElement?: MarkerTargetElement;
  /** Selector format used in targetElement - 'legacy' for SelectorDescriptor, 'playwright' for PlaywrightLocatorJson */
  selectorFormat?: 'legacy' | 'playwright';
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
  /** Snapshot format version (e.g., "2.0.0") - optional for backward compatibility */
  version?: string;
  /** Hash identifier for this test */
  testHash: string;
  /** Original test text (mimic template string) */
  testText: string;
  /** Steps indexed by stepHash (command line text hash) for efficient lookup and selective regeneration */
  stepsByHash: Record<string, SnapshotStep>;
  /** Array of executed steps (for backward compatibility and ordered replay) */
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
  /** Type of action (navigation, click, form update, assertion) */
  actionKind: 'navigation' | 'click' | 'form update' | 'assertion';
  /** Full action details (varies by actionKind) */
  actionDetails: NavigationAction | ClickActionResult | FormActionResult | AssertionActionResult;
  /** Target element information using marker ID (for click, form, and assertion actions) */
  targetElement?: MarkerTargetElement;
}
