/**
 * Test Annotation Utility
 * 
 * Centralized utility for adding test annotations to Playwright test reports.
 * Provides consistent annotation formatting across all action types.
 */

import { TestInfo } from '@playwright/test';
import { logger } from './logger.js';

/**
 * Add a test annotation with consistent formatting
 * 
 * This function handles the common pattern of adding annotations when testInfo
 * is available, or falling back to logger when it's not (e.g., in agentic context).
 * 
 * @param testInfo - Playwright TestInfo object (optional, for test context)
 * @param gherkinStep - The original Gherkin step that triggered this action (used as annotation type)
 * @param description - The description of what action is being performed (used as annotation description)
 * @param playwrightCode - Optional Playwright code equivalent to add to the annotation
 * @returns void
 */
export function addAnnotation(
  testInfo: TestInfo | undefined,
  gherkinStep: string | undefined,
  description: string,
  playwrightCode?: string
): void {
  // Combine description with Playwright code if provided
  let fullDescription = description;
  if (playwrightCode) {
    fullDescription += `\n  📝 Playwright: ${playwrightCode}`;
  }
  
  if (testInfo && gherkinStep) {
    testInfo.annotations.push({ 
      type: gherkinStep, 
      description: fullDescription
    });
  } else {
    // Fallback to logger when testInfo is not available
    logger.info(fullDescription);
  }
}
