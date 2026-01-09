/**
 * Snapshot Storage Module
 * 
 * Handles reading, writing, and managing test execution snapshots.
 * Snapshots store successful test executions as JSON files for fast replay.
 */

import { createHash } from 'crypto';
import fs from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
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
 * Generate a hash from step text to create a unique identifier
 * 
 * @param stepText - The step text (Gherkin step)
 * @returns SHA-256 hash of the step text (first 16 characters for readability)
 */
export function hashStepText(stepText: string): string {
  const hash = createHash('sha256');
  hash.update(stepText.trim());
  return hash.digest('hex').substring(0, 16);
}

/**
 * Extract test file name from full file path
 * 
 * @param testFilePath - Full path to the test file
 * @returns Test file name without extension (e.g., "buttons-variety" from "buttons-variety.spec.ts")
 */
export function getTestFileName(testFilePath: string): string {
  const fileName = basename(testFilePath);
  // Remove extension (e.g., "agentic.spec.ts" -> "agentic.spec" -> "agentic")
  const nameWithoutExt = fileName.replace(/\.(spec|test)\.(ts|js|tsx|jsx)$/, '');
  return nameWithoutExt;
}

/**
 * Get the mimic directory path for a test file
 * 
 * @param testFilePath - Full path to the test file
 * @returns Path to the __mimic__ directory
 */
export function getMimicDir(testFilePath: string): string {
  const testFileDir = dirname(testFilePath);
  return join(testFileDir, '__mimic__');
}

/**
 * Get the mimic file path for a test file
 * 
 * @param testFilePath - Full path to the test file
 * @returns Full path to the mimic JSON file (e.g., "__mimic__/agentic.mimic.json")
 */
export function getMimicFilePath(testFilePath: string): string {
  const mimicDir = getMimicDir(testFilePath);
  const testFileName = getTestFileName(testFilePath);
  return join(mimicDir, `${testFileName}.mimic.json`);
}

/**
 * Ensure the __mimic__ directory exists
 * 
 * @param testFilePath - Full path to the test file
 * @returns Promise that resolves when directory is created or already exists
 */
async function ensureMimicDir(testFilePath: string): Promise<void> {
  const mimicDir = getMimicDir(testFilePath);
  try {
    await fs.mkdir(mimicDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, which is fine
    if (error instanceof Error && !error.message.includes('EEXIST')) {
      throw error;
    }
  }
}

/**
 * Interface for the mimic file structure containing multiple tests
 */
interface MimicFile {
  tests: Snapshot[];
}

/**
 * Get the snapshot directory path for a test file (legacy support)
 * 
 * @param testFilePath - Directory path of the test file
 * @returns Path to the .mimic-snapshots directory
 * @deprecated Use getMimicDir instead
 */
export function getSnapshotDir(testFilePath: string): string {
  return join(testFilePath, '.mimic-snapshots');
}

/**
 * Get the snapshot file path for a specific test (legacy support)
 * 
 * @param testFilePath - Directory path of the test file
 * @param testHash - Hash identifier for the test
 * @returns Full path to the snapshot JSON file
 * @deprecated Use getMimicFilePath instead
 */
export function getSnapshotPath(testFilePath: string, testHash: string): string {
  const snapshotDir = getSnapshotDir(testFilePath);
  return join(snapshotDir, `${testHash}.json`);
}


/**
 * Read a snapshot from disk
 * 
 * @param testFilePath - Full path to the test file
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

  const mimicFilePath = getMimicFilePath(testFilePath);
  
  try {
    const content = await fs.readFile(mimicFilePath, 'utf-8');
    const mimicFile = JSON.parse(content) as MimicFile;
    
    // Find the test by testHash
    const snapshot = mimicFile.tests?.find(test => test.testHash === testHash);
    return snapshot || null;
  } catch (error) {
    // File doesn't exist or is invalid - return null
    if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
      // Try legacy location for backward compatibility
      return getSnapshotLegacy(testFilePath, testHash);
    }
    // For other errors (parse errors, etc.), log and return null
    console.warn(`Failed to read snapshot at ${mimicFilePath}:`, error);
    return null;
  }
}

/**
 * Read a snapshot from legacy location (backward compatibility)
 * 
 * @param testFilePath - Full path to the test file
 * @param testHash - Hash identifier for the test
 * @returns Snapshot object if found, null otherwise
 */
async function getSnapshotLegacy(
  testFilePath: string,
  testHash: string
): Promise<Snapshot | null> {
  const testFileDir = dirname(testFilePath);
  const snapshotPath = getSnapshotPath(testFileDir, testHash);
  
  try {
    const content = await fs.readFile(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(content) as Snapshot;
    return snapshot;
  } catch (error) {
    // File doesn't exist or is invalid - return null
    if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

/**
 * Save a snapshot to disk
 * 
 * Saves all tests from a test file into a single JSON file in __mimic__ directory.
 * Updates existing test entry if testHash already exists, otherwise adds new test.
 * 
 * @param testFilePath - Full path to the test file
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

  await ensureMimicDir(testFilePath);
  const mimicFilePath = getMimicFilePath(testFilePath);
  
  // Read existing file if it exists
  let mimicFile: MimicFile = { tests: [] };
  try {
    const content = await fs.readFile(mimicFilePath, 'utf-8');
    mimicFile = JSON.parse(content) as MimicFile;
    // Ensure tests array exists
    if (!mimicFile.tests) {
      mimicFile.tests = [];
    }
  } catch (error) {
    // File doesn't exist - start with empty structure
    if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
      mimicFile = { tests: [] };
    } else {
      // For other errors, log and start fresh
      console.warn(`Failed to read existing mimic file at ${mimicFilePath}, starting fresh:`, error);
      mimicFile = { tests: [] };
    }
  }
  
  // Update timestamps in flags
  const now = new Date().toISOString();
  if (!snapshot.flags) {
    snapshot.flags = {
      needsRetry: false,
      hasErrors: false,
      troubleshootingEnabled: false,
      skipSnapshot: false,
      forceRegenerate: false,
      debugMode: false,
      createdAt: now,
      lastPassedAt: now,
      lastFailedAt: null,
    };
  } else {
    snapshot.flags.lastPassedAt = now;
    if (!snapshot.flags.createdAt) {
      snapshot.flags.createdAt = now;
    }
  }
  
  // Find existing test by testHash and update, or add new
  const existingIndex = mimicFile.tests.findIndex(test => test.testHash === snapshot.testHash);
  if (existingIndex >= 0) {
    // Merge with existing test: preserve existing steps that weren't regenerated
    const existingTest = mimicFile.tests[existingIndex];
    
    // Merge stepsByHash: new steps overwrite old ones, but keep steps that weren't regenerated
    const mergedStepsByHash: Record<string, SnapshotStep> = {};
    
    // Start with existing steps (support both formats)
    if (existingTest.stepsByHash) {
      Object.assign(mergedStepsByHash, existingTest.stepsByHash);
    } else if (existingTest.steps) {
      // Convert old format to new format
      for (const step of existingTest.steps) {
        mergedStepsByHash[step.stepHash] = step;
      }
    }
    
    // Add/overwrite with new steps from snapshot
    if (snapshot.stepsByHash) {
      Object.assign(mergedStepsByHash, snapshot.stepsByHash);
    } else if (snapshot.steps) {
      // Convert new snapshot's steps array to stepsByHash if needed
      for (const step of snapshot.steps) {
        mergedStepsByHash[step.stepHash] = step;
      }
    }
    
    // Build merged steps array from mergedStepsByHash, sorted by stepIndex
    const allMergedSteps = Object.values(mergedStepsByHash);
    allMergedSteps.sort((a, b) => a.stepIndex - b.stepIndex);
    
    // Update the test with merged data
    mimicFile.tests[existingIndex] = {
      ...snapshot,
      stepsByHash: mergedStepsByHash,
      steps: allMergedSteps, // Maintain backward compatibility with steps array
    };
  } else {
    // Add new test - ensure steps array exists even if only stepsByHash is provided
    const finalSnapshot: Snapshot = {
      ...snapshot,
      steps: snapshot.steps || (snapshot.stepsByHash ? Object.values(snapshot.stepsByHash).sort((a, b) => a.stepIndex - b.stepIndex) : []),
      stepsByHash: snapshot.stepsByHash || (snapshot.steps ? (() => {
        const hash: Record<string, SnapshotStep> = {};
        for (const step of snapshot.steps) {
          hash[step.stepHash] = step;
        }
        return hash;
      })() : {}),
    };
    mimicFile.tests.push(finalSnapshot);
  }

  // Write back to file
  await fs.writeFile(
    mimicFilePath,
    JSON.stringify(mimicFile, null, 2),
    'utf-8'
  );
}

/**
 * Record a test failure timestamp
 * 
 * Updates the snapshot's lastFailedAt timestamp and flags if the snapshot exists.
 * 
 * @param testFilePath - Full path to the test file
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
    const now = new Date().toISOString();
    const failureSnapshot: Snapshot = {
      testHash,
      testText: '',
      steps: [],
      flags: {
        needsRetry: true,
        hasErrors: true,
        troubleshootingEnabled: false,
        skipSnapshot: false,
        forceRegenerate: false,
        debugMode: false,
        createdAt: now,
        lastPassedAt: null,
        lastFailedAt: now,
      },
    };
    await saveSnapshot(testFilePath, failureSnapshot);
    return;
  }

  // Update existing snapshot with failure info
  if (!snapshot.flags) {
    const now = new Date().toISOString();
    snapshot.flags = {
      needsRetry: true,
      hasErrors: true,
      troubleshootingEnabled: false,
      skipSnapshot: false,
      forceRegenerate: false,
      debugMode: false,
      createdAt: snapshot.flags?.createdAt || now,
      lastPassedAt: snapshot.flags?.lastPassedAt || null,
      lastFailedAt: now,
    };
  } else {
    snapshot.flags.lastFailedAt = new Date().toISOString();
    snapshot.flags.needsRetry = true;
    snapshot.flags.hasErrors = true;
  }
  
  // Store failure details if provided (store in flags for easier access)
  if (failedStepIndex !== undefined || failedStepText || error) {
    (snapshot.flags as any).failureDetails = {
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
 * - Flags don't indicate it should be skipped
 * 
 * Note: Even in troubleshoot mode, we use snapshots if they've passed.
 * Regeneration will happen only if replay fails.
 * 
 * @param testFilePath - Full path to the test file
 * @param testHash - Hash identifier for the test
 * @param troubleshootMode - Whether troubleshoot mode is enabled (unused, kept for compatibility)
 * @param expectedStepCount - Expected number of steps (optional)
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

  // Check if snapshot should be skipped
  if (snapshot.flags?.skipSnapshot) {
    return false;
  }

  // Check if force regenerate is enabled
  if (snapshot.flags?.forceRegenerate) {
    return false;
  }

  // Validate that snapshot has at least as many steps as expected input lines
  if (expectedStepCount !== undefined) {
    // Count unique steps in snapshot
    // Support both new format (stepsByHash) and old format (steps array)
    let snapshotStepCount: number;
    if (snapshot.stepsByHash) {
      snapshotStepCount = Object.keys(snapshot.stepsByHash).length;
    } else if (snapshot.steps) {
      const uniqueStepIndices = new Set(snapshot.steps.map((step: { stepIndex: number }) => step.stepIndex));
      snapshotStepCount = uniqueStepIndices.size;
    } else {
      snapshotStepCount = 0;
    }
    
    if (snapshotStepCount < expectedStepCount) {
      // Snapshot is incomplete - don't use it
      return false;
    }
  }

  // If never passed, don't use snapshot
  if (!snapshot.flags?.lastPassedAt) {
    return false;
  }

  // If never failed, use snapshot
  if (!snapshot.flags?.lastFailedAt) {
    return true;
  }

  // Compare timestamps: use snapshot if pass is more recent than failure
  const passTime = new Date(snapshot.flags.lastPassedAt).getTime();
  const failTime = new Date(snapshot.flags.lastFailedAt).getTime();
  
  return passTime > failTime;
}
