/**
 * Test Annotation Utility
 * 
 * Centralized utility for adding test annotations to Playwright test reports.
 * Provides consistent annotation formatting across all action types.
 */

import { TestInfo } from '@playwright/test';

/**
 * Add a test annotation with consistent formatting
 * 
 * This function handles the common pattern of adding annotations when testInfo
 * is available, or falling back to console.log when it's not (e.g., in agentic context).
 * 
 * @param testInfo - Playwright TestInfo object (optional, for test context)
 * @param gherkinStep - The original Gherkin step that triggered this action (used as annotation type)
 * @param description - The description of what action is being performed (used as annotation description)
 * @returns void
 */
export function addAnnotation(
  testInfo: TestInfo | undefined,
  gherkinStep: string | undefined,
  description: string
): void {
  if (testInfo && gherkinStep) {
    testInfo.annotations.push({ 
      type: gherkinStep, 
      description 
    });
  } else {
    // Fallback to console.log when testInfo is not available (e.g., agentic context)
    console.log(description);
  }
}
