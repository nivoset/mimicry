/**
 * Snapshot Storage Module
 * 
 * Handles reading, writing, and managing test execution snapshots.
 * Snapshots store successful test executions as JSON files for fast replay.
 */

import { createHash } from 'crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { Snapshot } from './types.js';

/**
 * Generate a hash from test text to create a unique identifier
 * 
 * @param testText - The test text (mimic template string)
 * @returns SHA-256 hash of the test text (first 16 characters for readability)
 */
export function hashTestText(testText: string): string {
  const hash = createHash('sha256');
  hash.update(testText.trim());
  return hash.digest('hex').substring(0, 16);
}

/**
 * Get the snapshot directory path for a test file
 * 
 * @param testFilePath - Directory path of the test file
 * @returns Path to the .mimic-snapshots directory
 */
export function getSnapshotDir(testFilePath: string): string {
  return join(testFilePath, '.mimic-snapshots');
}

/**
 * Get the snapshot file path for a specific test
 * 
 * @param testFilePath - Directory path of the test file
 * @param testHash - Hash identifier for the test
 * @returns Full path to the snapshot JSON file
 */
export function getSnapshotPath(testFilePath: string, testHash: string): string {
  const snapshotDir = getSnapshotDir(testFilePath);
  return join(snapshotDir, `${testHash}.json`);
}

/**
 * Ensure the snapshot directory exists
 * 
 * @param testFilePath - Directory path of the test file
 * @returns Promise that resolves when directory is created or already exists
 */
async function ensureSnapshotDir(testFilePath: string): Promise<void> {
  const snapshotDir = getSnapshotDir(testFilePath);
  try {
    await fs.mkdir(snapshotDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, which is fine
    if (error instanceof Error && !error.message.includes('EEXIST')) {
      throw error;
    }
  }
}

/**
 * Read a snapshot from disk
 * 
 * @param testFilePath - Directory path of the test file
 * @param testHash - Hash identifier for the test
 * @returns Snapshot object if found, null otherwise
 */
export async function getSnapshot(
  testFilePath: string,
  testHash: string
): Promise<Snapshot | null> {
  if (!testFilePath) {
    return null;
  }

  const snapshotPath = getSnapshotPath(testFilePath, testHash);
  
  try {
    const content = await fs.readFile(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(content) as Snapshot;
    return snapshot;
  } catch (error) {
    // File doesn't exist or is invalid - return null
    if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
      return null;
    }
    // For other errors (parse errors, etc.), log and return null
    console.warn(`Failed to read snapshot at ${snapshotPath}:`, error);
    return null;
  }
}

/**
 * Save a snapshot to disk
 * 
 * @param testFilePath - Directory path of the test file
 * @param snapshot - Snapshot object to save
 * @returns Promise that resolves when snapshot is saved
 */
export async function saveSnapshot(
  testFilePath: string,
  snapshot: Snapshot
): Promise<void> {
  if (!testFilePath) {
    return;
  }

  await ensureSnapshotDir(testFilePath);
  const snapshotPath = getSnapshotPath(testFilePath, snapshot.testHash);
  
  // Update timestamps
  const now = new Date().toISOString();
  snapshot.lastPassedAt = now;
  if (!snapshot.createdAt) {
    snapshot.createdAt = now;
  }

  await fs.writeFile(
    snapshotPath,
    JSON.stringify(snapshot, null, 2),
    'utf-8'
  );
}

/**
 * Record a test failure timestamp
 * 
 * Updates the snapshot's lastFailedAt timestamp if the snapshot exists.
 * 
 * @param testFilePath - Directory path of the test file
 * @param testHash - Hash identifier for the test
 * @param failedStepIndex - Index of the step that failed (optional)
 * @param failedStepText - Text of the step that failed (optional)
 * @param error - Error message (optional)
 * @returns Promise that resolves when failure is recorded
 */
export async function recordFailure(
  testFilePath: string,
  testHash: string,
  failedStepIndex?: number,
  failedStepText?: string,
  error?: string
): Promise<void> {
  if (!testFilePath) {
    return;
  }

  const snapshot = await getSnapshot(testFilePath, testHash);
  if (!snapshot) {
    // Create a minimal snapshot just for failure tracking
    const failureSnapshot: Snapshot = {
      testHash,
      testText: '',
      createdAt: new Date().toISOString(),
      lastPassedAt: null,
      lastFailedAt: new Date().toISOString(),
      steps: [],
    };
    await saveSnapshot(testFilePath, failureSnapshot);
    return;
  }

  // Update existing snapshot with failure info
  snapshot.lastFailedAt = new Date().toISOString();
  
  // Store failure details if provided
  if (failedStepIndex !== undefined || failedStepText || error) {
    (snapshot as any).failureDetails = {
      failedStepIndex,
      failedStepText,
      error,
    };
  }

  await saveSnapshot(testFilePath, snapshot);
}

/**
 * Determine if a snapshot should be used for replay
 * 
 * A snapshot should be used if:
 * - It exists
 * - lastPassedAt is more recent than lastFailedAt (or lastFailedAt is null)
 * 
 * Note: Even in troubleshoot mode, we use snapshots if they've passed.
 * Regeneration only happens if replay fails.
 * 
 * @param testFilePath - Directory path of the test file
 * @param testHash - Hash identifier for the test
 * @param troubleshootMode - Whether troubleshoot mode is enabled (unused, kept for compatibility)
 * @returns true if snapshot should be used, false otherwise
 */
export async function shouldUseSnapshot(
  testFilePath: string,
  testHash: string,
  _troubleshootMode: boolean = false,
  expectedStepCount?: number
): Promise<boolean> {
  // Use snapshots even in troubleshoot mode if they've passed
  // Regeneration will happen only if replay fails

  if (!testFilePath) {
    return false;
  }

  const snapshot = await getSnapshot(testFilePath, testHash);
  if (!snapshot) {
    return false;
  }

  // Validate that snapshot has at least as many steps as expected input lines
  if (expectedStepCount !== undefined) {
    // Count unique steps in snapshot (by stepIndex)
    const uniqueStepIndices = new Set(snapshot.steps.map((step: { stepIndex: number }) => step.stepIndex));
    const snapshotStepCount = uniqueStepIndices.size;
    
    if (snapshotStepCount < expectedStepCount) {
      // Snapshot is incomplete - don't use it
      return false;
    }
  }

  // If never passed, don't use snapshot
  if (!snapshot.lastPassedAt) {
    return false;
  }

  // If never failed, use snapshot
  if (!snapshot.lastFailedAt) {
    return true;
  }

  // Compare timestamps: use snapshot if pass is more recent than failure
  const passTime = new Date(snapshot.lastPassedAt).getTime();
  const failTime = new Date(snapshot.lastFailedAt).getTime();
  
  return passTime > failTime;
}
