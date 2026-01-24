import { generateText } from 'ai';
import { logger } from '../mimic/logger.js';

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

type TokenCounter = UnwrapPromise<ReturnType<typeof generateText>>;

// Holistic counter - tracks tokens across all test cases
const holisticCounter = new Map<string, number>();

// Per-test-case counters - tracks tokens for individual test cases
const testCaseCounters = new Map<string, Map<string, number>>();

/**
 * Recursively count tokens from usage object, accumulating all numbers at root level
 * 
 * @param usage - Usage object that may contain nested objects with token counts
 * @param counter - The counter Map to update
 * @param prefix - Optional prefix for nested keys (used for recursion)
 */
const countTokensRecursive = (
  usage: Record<string, unknown>,
  counter: Map<string, number>,
  prefix: string = ''
): void => {
  for (const key in usage) {
    const value = usage[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'number') {
      // Accumulate numbers at root level
      const rootKey = key; // Use the key name at root level
      if (counter.has(rootKey)) {
        counter.set(rootKey, counter.get(rootKey)! + value);
      } else {
        counter.set(rootKey, value);
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively process nested objects
      countTokensRecursive(value as Record<string, unknown>, counter, fullKey);
    }
    // Skip arrays and null values
  }
};

/**
 * Count tokens from a generateText result's usage object
 * Tracks both holistic (global) and per-test-case counts
 * 
 * @param usage - Usage object from generateText result
 * @param testCaseName - Optional test case name for per-test-case tracking
 */
export const countTokens = async (
  { usage }: Pick<TokenCounter, 'usage'>,
  testCaseName?: string
) => {
  if (!usage) {
    return;
  }

  // Convert usage to a plain object if needed
  const usageObj = usage as Record<string, unknown>;
  
  // Always update holistic counter
  countTokensRecursive(usageObj, holisticCounter);
  
  // Update per-test-case counter if test case name is provided
  if (testCaseName) {
    if (!testCaseCounters.has(testCaseName)) {
      testCaseCounters.set(testCaseName, new Map<string, number>());
    }
    const testCaseCounter = testCaseCounters.get(testCaseName)!;
    countTokensRecursive(usageObj, testCaseCounter);
  }
};

/**
 * Start tracking tokens for a specific test case
 * Initializes the test case counter
 * 
 * @param testCaseName - Name of the test case to start tracking
 */
export const startTestCase = (testCaseName: string) => {
  if (!testCaseCounters.has(testCaseName)) {
    testCaseCounters.set(testCaseName, new Map<string, number>());
  }
};

/**
 * End tracking for a specific test case (optional cleanup)
 * Currently keeps the data for later querying, but can be used for cleanup
 * 
 * @param _testCaseName - Name of the test case to end tracking
 */
export const endTestCase = (_testCaseName: string) => {
  // Optionally keep the data, or remove it if you want to free memory
  // For now, we'll keep it so you can query it later
  // To actually delete: testCaseCounters.delete(_testCaseName);
};

/**
 * Display accumulated token counts
 * Shows both holistic and per-test-case counts
 * 
 * @param testCaseName - Optional test case name to display only that test case's counts
 */
export const displayTokens = async (testCaseName?: string) => {
  if (testCaseName) {
    // Display specific test case
    const testCaseCounter = testCaseCounters.get(testCaseName);
    if (!testCaseCounter || testCaseCounter.size === 0) {
      logger.info({ testCaseName }, `Tokens for "${testCaseName}": No tokens counted yet`);
      return;
    }
    
    const entries = Array.from(testCaseCounter.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `  - ${key}: ${value}`)
      .join('\n');
    
    logger.info({ testCaseName, entries }, `Tokens for "${testCaseName}":\n${entries}`);
  } else {
    // Display holistic and all test cases
    if (holisticCounter.size === 0 && testCaseCounters.size === 0) {
      logger.info('Tokens: No tokens counted yet');
      return;
    }
    
    // Display holistic counts
    if (holisticCounter.size > 0) {
      const holisticEntries = Array.from(holisticCounter.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `  - ${key}: ${value}`)
        .join('\n');
      
      logger.info({ holisticEntries }, `Holistic Tokens (All Test Cases):\n${holisticEntries}`);
    }
    
    // Display per-test-case counts
    if (testCaseCounters.size > 0) {
      logger.info('\nPer-Test-Case Tokens:');
      const sortedTestCases = Array.from(testCaseCounters.entries())
        .sort(([a], [b]) => a.localeCompare(b));
      
      for (const [testCase, counter] of sortedTestCases) {
        const entries = Array.from(counter.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `    - ${key}: ${value}`)
          .join('\n');
        
        logger.info({ testCase, entries }, `  "${testCase}":\n${entries}`);
      }
    }
  }
};

/**
 * Reset all token counters (holistic and per-test-case)
 */
export const resetTokens = () => {
  holisticCounter.clear();
  testCaseCounters.clear();
};

/**
 * Reset only a specific test case counter
 * 
 * @param testCaseName - Name of the test case to reset
 */
export const resetTestCase = (testCaseName: string) => {
  testCaseCounters.delete(testCaseName);
};

/**
 * Get holistic token counts as an object
 */
export const getHolisticTokens = (): Record<string, number> => {
  return Object.fromEntries(holisticCounter);
};

/**
 * Get token counts for a specific test case as an object
 * 
 * @param testCaseName - Name of the test case
 */
export const getTestCaseTokens = (testCaseName: string): Record<string, number> | null => {
  const counter = testCaseCounters.get(testCaseName);
  return counter ? Object.fromEntries(counter) : null;
};

/**
 * Get all test case names that have been tracked
 */
export const getTestCaseNames = (): string[] => {
  return Array.from(testCaseCounters.keys()).sort();
};

/**
 * Get current token counts as an object (backwards compatibility)
 * Returns holistic tokens
 */
export const getTokens = (): Record<string, number> => {
  return getHolisticTokens();
};