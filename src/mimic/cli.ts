import "dotenv/config";
/**
 * CLI Argument Parsing
 * 
 * Utility functions for parsing command-line arguments passed to Playwright tests.
 */

/**
 * Check if troubleshoot mode is enabled via CLI argument or environment variable
 * 
 * Troubleshoot mode forces tests to rebuild snapshots even when they fail.
 * This is useful for debugging and updating snapshots after fixing issues.
 * 
 * Can be enabled via:
 * - CLI flag: --troubleshoot
 * - Environment variable: MIMIC_TROUBLESHOOT=true
 * 
 * @returns true if troubleshoot mode is enabled
 */


export function isTroubleshootMode(): boolean {
  // Check CLI argument
  if (process.argv.includes('--troubleshoot')) {
    console.log('Troubleshoot mode is enabled via CLI argument');
    return true;
  }
  
  // Check environment variable
  if (process.env.MIMIC_TROUBLESHOOT === 'true' || process.env.MIMIC_TROUBLESHOOT === '1') {
    console.log('Troubleshoot mode is enabled via environment variable');
    return true;
  }
  
  return false;
}
