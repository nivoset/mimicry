/**
 * CLI Argument Parsing
 * 
 * Utility functions for parsing command-line arguments passed to Playwright tests.
 */

/**
 * Check if troubleshoot mode is enabled via CLI argument
 * 
 * Troubleshoot mode forces tests to rebuild snapshots even when they fail.
 * This is useful for debugging and updating snapshots after fixing issues.
 * 
 * @returns true if --troubleshoot flag is present in process.argv
 */
export function isTroubleshootMode(): boolean {
  return process.argv.includes('--troubleshoot');
}
