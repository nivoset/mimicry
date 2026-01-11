import { type LanguageModel, generateText, Output } from 'ai'
import { Page, TestInfo } from '@playwright/test'

import {
  zNavigationAction,
  type NavigationAction,
} from './schema/action.js'
import { countTokens } from '../utils/token-counter.js';
import { addAnnotation } from './annotations.js';
import type { TestContext } from '../mimic.js';
import { generateNavigationCode } from './playwrightCodeGenerator.js';

export const getNavigationAction = async (
  _page: Page, 
  brain: LanguageModel, 
  action: string,
  testContext?: TestContext,
  testCaseName?: string
): Promise<NavigationAction> => {
  // Build context description for the prompt
  const contextDescription = testContext ? `
**Test Context:**
- Current URL: ${testContext.currentState.url}
- Current Page Title: ${testContext.currentState.pageTitle}
- Step ${testContext.currentStepIndex + 1} of ${testContext.totalSteps}
${testContext.previousSteps.length > 0 ? `
**Previous Steps Executed:**
${testContext.previousSteps.map((prevStep, idx) => 
  `${idx + 1}. Step ${prevStep.stepIndex + 1}: "${prevStep.stepText}" (${prevStep.actionKind}${prevStep.url ? ` → ${prevStep.url}` : ''})`
).join('\n')}
` : ''}
` : '';

  const res = await generateText({
    model: brain,
    maxRetries: 3,
      prompt: `You are an expert in converting Gherkin test steps into structured browser automation action objects using Playwright.

Your task is to process a single Gherkin step and determine whether it represents a **navigation** action. this can be any of the following:
- navigate to a page (this requires a url, if no url is provided, go for an option below)
- closePage: close the current page
- goBack: go back to the previous page, or navigate back in the browser history
- goForward: go forward to the next page, or navigate forward in the browser history
- refresh: refresh the current page, or reload the page

${contextDescription}
**Input Gherkin step:** ${action}

**Instructions:**
1. Determine the navigation type and extract the URL if applicable
2. For navigate/openPage actions, determine if the step indicates opening in a new window/tab:
   - If the step mentions "new window", "new tab", "open in new", "in a new page", or similar phrases, set newWindow: true
   - Otherwise, set newWindow: false or omit it (defaults to false)
3. Provide a clear, human-readable description of what navigation is happening
   - For navigate/openPage: "Navigate to [page name or URL]" (e.g., "Navigate to login page", "Navigate to https://example.com")
   - For navigate/openPage with newWindow: "Navigate to [page name or URL] in new window/tab" (e.g., "Navigate to login page in new window")
   - Do not hallucinate the domain, if none are mentioned, just pass the uri (e.g., "/login")
   - For goBack: "Go back to previous page in browser history" (the system will add the specific URL information)
   - For goForward: "Go forward to next page in browser history" (the system will add the specific URL information)
   - For refresh: "Refresh the current page" (the system will add the specific URL information)
   - For closePage: "Close the current browser page/tab" (the system will add the specific URL information)
    
    `,
    output: Output.object({ schema: zNavigationAction, name: 'navigation' }),
  });
  await countTokens(res, testCaseName);

  return res.output;
};

/**
 * Execute a navigation action on the page with plain English annotation
 * 
 * This function performs browser navigation actions (navigate, go back, refresh, etc.)
 * and adds test annotations for better traceability and validation.
 * 
 * @param page - Playwright Page object to perform navigation on
 * @param navigationAction - Navigation action containing type, parameters, and description
 * @param testInfo - Playwright TestInfo for adding annotations (optional)
 * @param gherkinStep - The original Gherkin step for annotation type (optional)
 * @returns Promise that resolves to the navigation action (for snapshot storage)
 */
export const executeNavigationAction = async (
  page: Page, 
  navigationAction: NavigationAction,
  testInfo?: TestInfo,
  gherkinStep?: string
): Promise<NavigationAction> => {
  // Use LLM-generated description or build a default one
  const actionDescription = navigationAction.description || 'navigation action';

  // Generate Playwright code equivalent
  const playwrightCode = generateNavigationCode(
    navigationAction.type,
    navigationAction.params.url ?? undefined,
    navigationAction.params.newWindow,
  );

  switch (navigationAction.type) {
    case 'openPage':
    case 'navigate':
      // Check if we need to open in a new window/tab
      if (navigationAction.params.newWindow) {
        // Create a new page in the same browser context
        const context = page.context();
        const newPage = await context.newPage();
        addAnnotation(testInfo, gherkinStep, `→ ${actionDescription} in new window/tab and waiting for page to load completely`, playwrightCode);
        await newPage.goto(navigationAction.params.url!, { waitUntil: 'networkidle' });
        // Note: The new page is created and navigated, but the original page reference remains unchanged
        // The new page is available in the browser context and can be accessed via context.pages()
      } else {
        addAnnotation(testInfo, gherkinStep, `→ ${actionDescription} and waiting for page to load completely`, playwrightCode);
        await page.goto(navigationAction.params.url!, { waitUntil: 'networkidle' });
      }
      break;
    case 'closePage':
      // Only close page if explicitly requested - be very careful with this action
      // Check if page is still open before closing
      if (page.isClosed()) {
        addAnnotation(testInfo, gherkinStep, `→ Page is already closed, cannot close again`, playwrightCode);
        return navigationAction;
      }
      // Capture current URL for better traceability
      const currentUrlBeforeClose = page.url();
      addAnnotation(testInfo, gherkinStep, `→ ${actionDescription} (closing page at ${currentUrlBeforeClose})`, playwrightCode);
      await page.close();
      break;
    case 'goBack':
      // Capture current URL before going back for better traceability
      const currentUrlBeforeBack = page.url();
      await page.goBack();
      try {
        const urlAfterBack = page.url();
        addAnnotation(testInfo, gherkinStep, `→ ${actionDescription} (from ${currentUrlBeforeBack} to ${urlAfterBack})`, playwrightCode);
      } catch {
        addAnnotation(testInfo, gherkinStep, `→ ${actionDescription} (from ${currentUrlBeforeBack})`, playwrightCode);
      }
      break;
    case 'goForward':
      // Capture current URL before going forward for better traceability
      const currentUrlBeforeForward = page.url();
      await page.goForward();
      try {
        const urlAfterForward = page.url();
        addAnnotation(testInfo, gherkinStep, `→ ${actionDescription} (from ${currentUrlBeforeForward} to ${urlAfterForward})`, playwrightCode);
      } catch {
        addAnnotation(testInfo, gherkinStep, `→ ${actionDescription} (from ${currentUrlBeforeForward})`, playwrightCode);
      }
      break;
    case 'refresh':
      // Capture current URL for better traceability
      const currentUrlBeforeRefresh = page.url();
      addAnnotation(testInfo, gherkinStep, `→ ${actionDescription} to reload all content (refreshing ${currentUrlBeforeRefresh})`, playwrightCode);
      await page.reload();
      break;
    default:
      throw new Error(`Unknown navigation action type: ${navigationAction.type}`);
  }
  
  // Return the action for snapshot storage
  return navigationAction;
};