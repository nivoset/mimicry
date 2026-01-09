import { type LanguageModel, generateText, Output } from 'ai'
import { Locator, Page, TestInfo } from '@playwright/test'

import {
  zClickActionResult,
  type ClickActionResult
} from './schema/action.js'
import { countTokens } from '../utils/token-counter.js';
import { addAnnotation } from './annotations.js';
import type { TestContext } from '../mimic.js';
import { generateBestSelectorForElement } from './selector.js';
import { selectorToPlaywrightCode, generateClickCode } from './playwrightCodeGenerator.js';
import { captureScreenshot } from './markers.js';

/**
 * Get click action by matching Gherkin step against captured target elements
 * 
 * This function uses AI to analyze a Gherkin step and match it against
 * all available target elements on the page. It returns the top 5 most
 * likely candidates along with the appropriate click type.
 * 
 * @param page - Playwright Page object (currently unused but kept for consistency)
 * @param brain - LanguageModel instance for AI analysis
 * @param gherkinStep - The Gherkin step to match (e.g., "I click on the Submit button")
 * @param targetElements - Array of captured elements with marker IDs from the page
 * @param testContext - Optional test context with previous steps and current state
 * @returns Promise resolving to ClickActionResult with top candidates and click type
 */
export const getClickAction = async (
  page: Page,
  brain: LanguageModel,
  gherkinStep: string,
  testContext?: TestContext
): Promise<ClickActionResult> => {
  const startTime = Date.now();
  
  // Capture screenshot with markers and positioning data
  console.log('📸 [getClickAction] Starting screenshot capture with markers...');
  const screenshotStart = Date.now();
  const { image: screenshot, markers: markerData, items: markerItems } = await captureScreenshot(page);
  const screenshotTime = Date.now() - screenshotStart;
  console.log(`📸 [getClickAction] Screenshot captured in ${screenshotTime}ms (${(screenshotTime / 1000).toFixed(2)}s)`);
  
  const base64Start = Date.now();
  const screenshotBase64 = screenshot.toString('base64');
  const base64Time = Date.now() - base64Start;
  console.log(`📸 [getClickAction] Screenshot converted to base64 in ${base64Time}ms (${(base64Time / 1000).toFixed(2)}s), size: ${(screenshotBase64.length / 1024).toFixed(2)}KB`);
  
  // Convert marker data to format expected by prompt
  const markerStart = Date.now();
  const markerItemsMap = new Map(markerItems.map(item => [item.mimicId, item]));
  const markerInfo: Array<{ 
    id: number; 
    tag: string; 
    text: string; 
    role: string | null; 
    ariaLabel: string | null;
    label: string | null;
  }> = markerData.map(m => {
    const item = markerItemsMap.get(m.mimicId);
    return {
      id: m.mimicId,
      tag: m.tag,
      text: m.text,
      role: m.role,
      ariaLabel: m.ariaLabel,
      label: item?.label || null,
    };
  });
  
  const markerTime = Date.now() - markerStart;
  console.log(`🔍 [getClickAction] Processed ${markerInfo.length} markers in ${markerTime}ms (${(markerTime / 1000).toFixed(2)}s)`);
  
  // Build marker summary for the prompt
  const summaryStart = Date.now();
  const markerSummary = markerInfo
    .slice(0, 50) // Limit to first 50 markers to avoid prompt size issues
    .map(m => `  Marker ${m.id}: ${m.tag}${m.role ? ` (role: ${m.role})` : ''}${m.text ? ` - "${m.text.substring(0, 50)}"` : ''}${m.label ? ` [label: "${m.label}"]` : ''}${m.ariaLabel ? ` [aria-label: "${m.ariaLabel}"]` : ''}`)
    .join('\n');
  const summaryTime = Date.now() - summaryStart;
  console.log(`📝 [getClickAction] Built marker summary in ${summaryTime}ms`);
  
  // Build context description for the prompt
  const promptStart = Date.now();
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

  const prompt = `You are an expert Playwright test engineer specializing in mapping Gherkin steps to concrete DOM interactions using visual analysis.

Your task is to analyze:
1. A screenshot of the page with numbered marker badges on elements
2. A single Gherkin step that implies a click action

**IMPORTANT**: Look at the screenshot to identify elements by their marker numbers. Each element has a numbered badge:
- **RED badges** = Interactive elements (buttons, links, inputs, etc.)
- **BLUE badges** = Display-only content elements
- **GREEN badges** = Structure/test anchor elements

You must return the **top 5 most likely elements** that the Gherkin step is referring to, identified by their **marker ID numbers** (the numbers shown on the badges in the screenshot).

---

### IMPORTANT RULES

- **ALWAYS use the marker ID (mimicId)** from the screenshot - this is the number shown on the element's badge
- Rank elements from **most likely (rank 1)** to **least likely (rank 5)**
- Prefer **semantic matches** first:
  - Visible text (what you can read in the screenshot)
  - Element position and visual appearance
  - Accessible name (label, aria-label, role)
  - Button / link intent
- Do NOT invent elements or marker IDs - only use marker IDs that are visible in the screenshot
- Do NOT include more than 5 results
- If fewer than 5 reasonable matches exist, return fewer
- Do NOT assume navigation or side effects — this task is only about **what element is clicked**
- For each candidate, provide:
  - The **mimicId** (marker number from the screenshot badge)
  - A **clear, human-readable description** that identifies the element (e.g., "Submit button", "Login link with text 'Sign in'")
  - Element metadata (tag, text, role, etc.) based on what you can see in the screenshot and the marker information provided
- Consider the test context - what steps came before may help identify the correct element

${contextDescription}
**Gherkin Step:**
${gherkinStep}

**Available Markers (${markerInfo.length} total):**
${markerSummary}
${markerInfo.length > 50 ? `\n... and ${markerInfo.length - 50} more markers` : ''}

## Analyze the screenshot and return up to the top 5 most likely elements that the Gherkin step is referring to.
Use the marker ID numbers (mimicId) shown on the badges in the screenshot to identify elements.
`;
  const promptTime = Date.now() - promptStart;
  console.log(`📝 [getClickAction] Built prompt in ${promptTime}ms, prompt length: ${prompt.length} chars`);

  // Build message content with screenshot
  const messageStart = Date.now();
  const messageContent: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [
    { type: 'text', text: prompt }
  ];
  
  // Add screenshot as base64 image
  messageContent.push({
    type: 'image',
    image: screenshotBase64
  });
  const messageTime = Date.now() - messageStart;
  console.log(`📨 [getClickAction] Built message content in ${messageTime}ms`);

  console.log('🤖 [getClickAction] Calling AI model...');
  const aiStart = Date.now();
  const res = await generateText({
    model: brain,
    messages: [
      { 
        role: 'user', 
        content: messageContent
      },
      {
        role: 'user', content: [
          // { type: 'text', text: prompt }, //TODO put the description of all the content
          {
            type: 'image',
            image: `data:image/png;base64,${screenshotBase64}`
          }
        ]
      }
    ],
    maxRetries: 3,
    output: Output.object({ schema: zClickActionResult, name: 'clickActionResult' }),
  });
  const aiTime = Date.now() - aiStart;
  console.log(`🤖 [getClickAction] AI model responded in ${aiTime}ms (${(aiTime / 1000).toFixed(2)}s)`);
  
  await countTokens(res);

  const totalTime = Date.now() - startTime;
  console.log(`⏱️  [getClickAction] Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
  console.log(`   Breakdown: screenshot=${screenshotTime}ms, base64=${base64Time}ms, markers=${markerTime}ms, summary=${summaryTime}ms, prompt=${promptTime}ms, message=${messageTime}ms, AI=${aiTime}ms`);

  return res.output;
};

/**
 * Execute a click action on a page element with plain English annotation
 * 
 * This function performs the actual click interaction and logs what action
 * is being performed in human-readable terms for better test traceability.
 * Uses the LLM-generated description from the selected candidate.
 * 
 * @param element - Playwright Locator for the target element to interact with
 * @param clickActionResult - Click action result containing click type and target information
 * @param selectedCandidate - The selected candidate element with LLM-generated description
 * @param testInfo - Playwright TestInfo for adding annotations
 * @param gherkinStep - The original Gherkin step for annotation type
 * @returns Promise that resolves to an object containing the action result and selector (for snapshot storage)
 */
export const executeClickAction = async (
  element: Locator | null,
  clickActionResult: ClickActionResult,
  selectedCandidate: ClickActionResult['candidates'][0],
  testInfo: TestInfo | undefined,
  gherkinStep: string,
): Promise<{ actionResult: ClickActionResult; selector: string | null }> => {
  // Use the LLM-generated description from the candidate
  // This description was created by the AI when matching the element
  const elementDescription = selectedCandidate.description || 'element';

  // Check if element is valid before attempting click
  if (!element) {
    throw new Error(`Cannot click: element not found or page may be closed`);
  }

  // Build annotation description based on click type
  let annotationDescription = '';
  switch (clickActionResult.clickType) {
    case 'left':
      annotationDescription = `→ Clicking on ${elementDescription} with left mouse button`;
      break;
    case 'right':
      annotationDescription = `→ Right-clicking on ${elementDescription} to open context menu`;
      break;
    case 'double':
      annotationDescription = `→ Double-clicking on ${elementDescription} to activate`;
      break;
    case 'middle':
      annotationDescription = `→ Clicking on ${elementDescription} with middle mouse button`;
      break;
    case 'hover':
      annotationDescription = `→ Hovering over ${elementDescription} to reveal additional options`;
      break;
    default:
      throw new Error(`Unknown click type: ${clickActionResult.clickType}`);
  }

  // Generate Playwright code equivalent BEFORE performing the action
  // This ensures the element is still available (before navigation/closure)
  let playwrightCode: string | undefined;
  let selector: string | null = null;
  
  try {
    // First, try to generate the best selector from the element
    // This gives us a more descriptive selector than just the mimicId
    // Use 5-minute timeout (300000ms) for slow tests - selector generation can be slow
    const selectorDescriptor = await generateBestSelectorForElement(element, { timeout: 300000 });
    const selectorCode = selectorToPlaywrightCode(selectorDescriptor);
    playwrightCode = generateClickCode(selectorCode, clickActionResult.clickType);
    
    // Also get selector string for snapshot storage
    try {
      const locatorString = element.toString();
      if (locatorString && locatorString !== '[object Object]') {
        selector = locatorString;
      }
    } catch (error) {
      // If we can't get selector string, that's okay
    }
  } catch (error) {
    // If generating from element fails, fall back to mimicId if available
    // This can happen if the element is not available or page is closing
    if (selectedCandidate.mimicId) {
      const selectorCode = `page.locator('[data-mimic-id="${selectedCandidate.mimicId}"]')`;
      playwrightCode = generateClickCode(selectorCode, clickActionResult.clickType);
      selector = `[data-mimic-id="${selectedCandidate.mimicId}"]`;
    } else {
      // If we can't generate the code, that's okay - just skip it
      console.debug('Could not generate Playwright code for click action:', error);
    }
  }

  // Add annotation using centralized utility (includes Playwright code if available)
  addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);

  // Perform the click action
  switch (clickActionResult.clickType) {
    case 'left':
      await element.click();
      break;
    case 'right':
      await element.click({ button: 'right' });
      break;
    case 'double':
      await element.dblclick();
      break;
    case 'middle':
      await element.click({ button: 'middle' });
      break;
    case 'hover':
      await element.hover();
      break;
    default:
      throw new Error(`Unknown click type: ${clickActionResult.clickType}`);
  }
  
  // Return action result and selector for snapshot storage
  return { actionResult: clickActionResult, selector };
};