import { Locator, Page, TestInfo } from '@playwright/test';
import { type LanguageModel, generateText, Output } from 'ai'
import z from 'zod';
import { countTokens } from '../utils/token-counter';
import { generateBestSelectorForElement } from './selector';
import { addAnnotation } from './annotations.js';
import type { TestContext } from '../mimic.js';
import { selectorToPlaywrightCode, generateFormCode } from './playwrightCodeGenerator.js';
import { captureScreenshot, generateAriaSnapshot } from './markers.js';
import type { SelectorDescriptor } from './selectorTypes.js';

const zFormActionResult = z.object({
  /**
   * The mimic ID (marker number) of the target form element
   * This is the number shown on the element's badge in the screenshot
   */
  mimicId: z.number().int().min(1).describe("The mimic ID (marker number) shown on the form element's badge in the screenshot"),
  type: z.enum(['keypress', 'type', 'fill', 'select', 'uncheck', 'check', 'click', 'setInputFiles', 'clear']),
  params: z.object({
    value: z.string().describe("Value to set for the form update."),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift', 'none'])).describe("Optional modifier keys to use for the form update."),
  }),
  /**
   * Human-readable description of the target form element for test annotations
   * Should clearly identify which form field is being interacted with (e.g., "Email input field", "Submit button", "Country dropdown")
   */
  elementDescription: z.string().describe("Human-readable description of the target form element for test annotations"),
})


export type FormActionResult = z.infer<typeof zFormActionResult>;

export const getFormAction = async (
  page: Page,
  brain: LanguageModel,
  gherkinStep: string,
  testContext?: TestContext
): Promise<FormActionResult> => {
  const startTime = Date.now();
  
  // Capture screenshot with markers and positioning data
  console.log('📸 [getFormAction] Starting screenshot capture with markers...');
  const screenshotStart = Date.now();
  const { image: screenshot, markers: markerData } = await captureScreenshot(page);
  const screenshotTime = Date.now() - screenshotStart;
  console.log(`📸 [getFormAction] Screenshot captured in ${screenshotTime}ms (${(screenshotTime / 1000).toFixed(2)}s)`);
  
  const base64Start = Date.now();
  const screenshotBase64 = screenshot.toString('base64');
  const base64Time = Date.now() - base64Start;
  console.log(`📸 [getFormAction] Screenshot converted to base64 in ${base64Time}ms (${(base64Time / 1000).toFixed(2)}s), size: ${(screenshotBase64.length / 1024).toFixed(2)}KB`);
  
  // Generate accessibility snapshot to explain the screenshot structure
  console.log('🔍 [getFormAction] Generating accessibility snapshot...');
  const ariaSnapshotStart = Date.now();
  const ariaSnapshot = await generateAriaSnapshot(page);
  const ariaSnapshotTime = Date.now() - ariaSnapshotStart;
  console.log(`🔍 [getFormAction] Accessibility snapshot generated in ${ariaSnapshotTime}ms (${(ariaSnapshotTime / 1000).toFixed(2)}s), length: ${ariaSnapshot.length} chars`);
  
  // Convert marker data to format expected by prompt
  const markerStart = Date.now();
  // Defensive check: ensure markerData is an array before mapping
  // This prevents "Cannot read properties of undefined (reading 'map')" errors
  const markerInfo: Array<{ 
    id: number; 
    tag: string; 
    text: string; 
    role: string | null; 
    ariaLabel: string | null;
  }> = (Array.isArray(markerData) ? markerData : []).map(m => {
    return {
      id: m.mimicId,
      tag: m.tag,
      text: m.text,
      role: m.role,
      ariaLabel: m.ariaLabel,
    };
  });
  const markerTime = Date.now() - markerStart;
  console.log(`🔍 [getFormAction] Processed ${markerInfo.length} markers in ${markerTime}ms (${(markerTime / 1000).toFixed(2)}s)`);
  
  // Filter to form elements only (inputs, textareas, selects, buttons)
  const filterStart = Date.now();
  const formMarkers = markerInfo.filter(m => 
    m.tag === 'input' || m.tag === 'textarea' || m.tag === 'select' || m.tag === 'button'
  );
  const filterTime = Date.now() - filterStart;
  console.log(`🔍 [getFormAction] Filtered to ${formMarkers.length} form elements in ${filterTime}ms`);
  
  // Build marker summary for the prompt
  const summaryStart = Date.now();
  const markerSummary = formMarkers
    .slice(0, 50) // Limit to first 50 markers to avoid prompt size issues
    .map(m => `  Marker ${m.id}: ${m.tag}${m.role ? ` (role: ${m.role})` : ''}${m.text ? ` - "${m.text.substring(0, 50)}"` : ''}${m.ariaLabel ? ` [aria-label: "${m.ariaLabel}"]` : ''}`)
    .join('\n');
  const summaryTime = Date.now() - summaryStart;
  console.log(`📝 [getFormAction] Built marker summary in ${summaryTime}ms`);
  
  // Build context description for the prompt
  const promptStart = Date.now();
  // Build context description with defensive checks for optional testContext
  // Ensure previousSteps exists and is an array before calling .map()
  const contextDescription = testContext ? `
**Test Context:**
- Current URL: ${testContext.currentState.url}
- Current Page Title: ${testContext.currentState.pageTitle}
- Step ${testContext.currentStepIndex + 1} of ${testContext.totalSteps}
${testContext.previousSteps && Array.isArray(testContext.previousSteps) && testContext.previousSteps.length > 0 ? `
**Previous Steps Executed:**
${testContext.previousSteps.map((prevStep, idx) => 
  `${idx + 1}. Step ${prevStep.stepIndex + 1}: "${prevStep.stepText}" (${prevStep.actionKind}${prevStep.url ? ` → ${prevStep.url}` : ''})`
).join('\n')}
` : ''}
` : '';

  const prompt = `You are an expert Playwright test engineer specializing in mapping Gherkin steps to form interactions using visual analysis.

Your task is to analyze:
1. A screenshot of the page with numbered marker badges on elements
2. An accessibility snapshot (provided below) that describes the page structure with roles, names, data-testid, and data-mimic-* attributes
3. A single Gherkin step that implies a form update action (typing, filling, selecting, checking, etc.)

**IMPORTANT**: Look at the screenshot to identify form elements by their marker numbers. Each element has a numbered badge:
- **RED badges** = Interactive elements (buttons, links, inputs, etc.)
- **BLUE badges** = Display-only content elements
- **GREEN badges** = Structure/test anchor elements

You must determine:
- The **mimicId** (marker number) of the target form element from the screenshot
- The type of form action (fill, type, select, check, uncheck, clear, etc.)
- The value to use (text to type, option to select, etc.)

---

### IMPORTANT RULES

- **ALWAYS use the marker ID (mimicId)** from the screenshot - this is the number shown on the form element's badge
- Do NOT invent elements or marker IDs - only use marker IDs that are visible in the screenshot
- For typing text (email addresses, names, messages, etc.), ALWAYS use "fill" or "type", NEVER "keypress"
- For checkboxes, ALWAYS use "check" or "uncheck", NEVER "keypress" or "click"
- For radio buttons, ALWAYS use "click", NEVER "check" (radio buttons should be clicked, not checked)
- "keypress" is ONLY for single keyboard keys like "Enter", "Tab", "Escape", "ArrowUp", "ArrowDown", etc.
- If the step says "type X into Y" or "fill Y with X", use "fill" (preferred) or "type", NOT "keypress"
- If the step says "check" or "select" a checkbox, use "check", NOT "keypress" or "click"
- If the step says "select" or "click" a radio button, use "click", NOT "check"
- Provide a clear, human-readable description of the target element (e.g., "Email input field", "Name field labeled 'Full Name'", "Submit button", "Country dropdown")
- Consider the test context - what steps came before may help identify the correct element

${contextDescription}
**Gherkin Step:**
${gherkinStep}

**Available Form Elements (${formMarkers.length} total):**
${markerSummary}
${formMarkers.length > 50 ? `\n... and ${formMarkers.length - 50} more form elements` : ''}

**Accessibility Snapshot (explains the screenshot structure):**
The following accessibility snapshot describes the page structure with roles, accessible names, data-testid attributes, and data-mimic-* attributes. Use this to understand the page structure alongside the screenshot:
\`\`\`
${ariaSnapshot}
\`\`\`

**Action Types:**
- fill: Replace all content in a field with text (USE THIS for typing text like email addresses, names, etc.)
- type: Type text character by character (slower, simulates real typing - use when needed for special cases)
- select: Select an option from dropdown/select element
- check: Check a checkbox (USE THIS when step says "check" or "select" a checkbox) - DO NOT use for radio buttons
- uncheck: Uncheck a checkbox (USE THIS when step says "uncheck" or "deselect" a checkbox)
- click: Click on a radio button to select it (USE THIS for radio buttons, NOT "check")
- clear: Clear field content
- keypress: Press a SINGLE KEY ONLY (e.g., "Enter", "Tab", "Escape", "ArrowDown") - DO NOT use for typing text strings, checkboxes, or radio buttons
- setInputFiles: Upload a file

## Analyze the screenshot and determine:
1. Which form element (by mimicId/marker number) is being targeted
2. What action type to perform
3. What value to use
4. A clear description of the target element

Use the marker ID numbers (mimicId) shown on the badges in the screenshot and referenced in the accessibility snapshot to identify the form element.`;
  const promptTime = Date.now() - promptStart;
  console.log(`📝 [getFormAction] Built prompt in ${promptTime}ms, prompt length: ${prompt.length} chars`);

  // Build message content - try without image first, then retry with image if needed
  const messageStart = Date.now();
  // First attempt: text-only (no image) - faster and cheaper
  const messageContentTextOnly: Array<{ type: 'text'; text: string }> = [
    { type: 'text', text: prompt }
  ];
  
  // Second attempt: with image (if first attempt fails)
  const messageContentWithImage: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [
    { type: 'text', text: prompt },
    { type: 'image', image: screenshotBase64 }
  ];
  const messageTime = Date.now() - messageStart;
  console.log(`📨 [getFormAction] Built message content in ${messageTime}ms`);

  // Set explicit timeout for AI calls to prevent indefinite hangs
  // 2 minutes should be sufficient for most AI responses, even with retries
  const aiTimeout = 120_000; // 2 minutes
  let res;
  let aiTime: number;
  let usedImage = false;

  // First attempt: try without image (text-only with accessibility snapshot)
  console.log('🤖 [getFormAction] Calling AI model (text-only, no image)...');
  const aiStart = Date.now();
  try {
    res = await Promise.race([
      generateText({
        model: brain,
        messages: [
          { 
            role: 'user', 
            content: messageContentTextOnly
          }
        ],
        maxRetries: 2, // Fewer retries for first attempt
        output: Output.object({ schema: zFormActionResult, name: 'formActionResult' }),
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`AI model call timed out after ${aiTimeout}ms`)), aiTimeout)
      )
    ]);
    
    // Validate the response
    if (!res.output || !res.output.mimicId || typeof res.output.mimicId !== 'number') {
      throw new Error('First attempt returned invalid result, retrying with image...');
    }
    
    aiTime = Date.now() - aiStart;
    console.log(`✅ [getFormAction] AI model responded successfully (text-only) in ${aiTime}ms (${(aiTime / 1000).toFixed(2)}s)`);
  } catch (error) {
    // First attempt failed - retry with image
    console.log(`⚠️  [getFormAction] First attempt failed, retrying with image: ${error instanceof Error ? error.message : String(error)}`);
    const retryStart = Date.now();
    usedImage = true;
    
    try {
      res = await Promise.race([
        generateText({
          model: brain,
          messages: [
            { 
              role: 'user', 
              content: messageContentWithImage
            }
          ],
          maxRetries: 3,
          output: Output.object({ schema: zFormActionResult, name: 'formActionResult' }),
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`AI model call timed out after ${aiTimeout}ms`)), aiTimeout)
        )
      ]);
      
      aiTime = Date.now() - retryStart;
      console.log(`✅ [getFormAction] AI model responded successfully (with image) in ${aiTime}ms (${(aiTime / 1000).toFixed(2)}s)`);
    } catch (retryError) {
      const elapsed = Date.now() - aiStart;
      throw new Error(`AI model call failed after ${elapsed}ms (tried both text-only and with image): ${retryError instanceof Error ? retryError.message : String(retryError)}`);
    }
  }
  
  await countTokens(res);
  
  const totalTime = Date.now() - startTime;
  console.log(`⏱️  [getFormAction] Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)${usedImage ? ' (used image on retry)' : ' (text-only, no image needed)'}`);
  console.log(`   Breakdown: screenshot=${screenshotTime}ms, base64=${base64Time}ms, markers=${markerTime}ms, filter=${filterTime}ms, summary=${summaryTime}ms, prompt=${promptTime}ms, message=${messageTime}ms, AI=${aiTime}ms`);

  // Validate that the AI model returned a valid structured output
  // The output should always be defined when using structured outputs, but add defensive check
  if (!res.output) {
    throw new Error('AI model failed to generate valid form action result. The output is undefined.');
  }

  // Validate that mimicId exists and is valid
  if (!res.output.mimicId || typeof res.output.mimicId !== 'number') {
    throw new Error(`AI model returned invalid form action result: mimicId is missing or invalid. Received: ${JSON.stringify(res.output)}`);
  }

  return res.output;
}


/**
 * Execute a form action on a page element with plain English annotation
 * 
 * This function performs form interactions (typing, selecting, checking, etc.)
 * and adds test annotations for better traceability and validation.
 * Uses the LLM-generated element description from the form action result.
 * 
 * @param page - Playwright Page object for keyboard actions
 * @param formActionResult - Form action result containing action type, parameters, and element description
 * @param targetElement - Playwright Locator for the target form element
 * @param testInfo - Playwright TestInfo for adding annotations (optional)
 * @param gherkinStep - The original Gherkin step for annotation type (optional)
 * @returns Promise that resolves when the form action is complete
 */
export const executeFormAction = async (
  page: Page,
  formActionResult: FormActionResult,
  targetElement: Locator | null,
  testInfo?: TestInfo,
  gherkinStep?: string
): Promise<{ actionResult: FormActionResult; selector: SelectorDescriptor | null }> => {
  if (targetElement === null) {
    throw new Error('No target element found');
  }

  // Use LLM-generated description from the form action result
  const elementDescription = formActionResult.elementDescription || 'form field';
  let annotationDescription = '';

  // Generate Playwright code equivalent BEFORE performing the action
  // This ensures the element is still available (before navigation/closure)
  let playwrightCode: string | undefined;
  let selector: SelectorDescriptor | null = null;
  
  try {
    // Generate the best selector descriptor from the element
    // This gives us a descriptive, stable selector for snapshot storage
    // Use 30-second timeout for selector generation
    const selectorDescriptor = await generateBestSelectorForElement(targetElement, { timeout: 30000 });
    const selectorCode = selectorToPlaywrightCode(selectorDescriptor);
    playwrightCode = generateFormCode(
      selectorCode,
      formActionResult.type,
      formActionResult.params.value
    );
    
    // Store the selector descriptor for snapshot storage
    selector = selectorDescriptor;
  } catch (error: any) {
    // If generating from element fails, fall back to mimicId if available
    // This can happen if the element is not available or page is closing
    const errorMessage = error?.message || String(error);
    
    // Check if page closed - this is a common issue with form submissions
    if (errorMessage.includes('closed') || errorMessage.includes('Target page')) {
      console.warn('Page closed during selector generation, using mimicId fallback');
    }
    
    if (formActionResult.mimicId) {
      const selectorCode = `page.locator('[data-mimic-id="${formActionResult.mimicId}"]')`;
      playwrightCode = generateFormCode(
        selectorCode,
        formActionResult.type,
        formActionResult.params.value
      );
      // Create a CSS selector descriptor as fallback
      selector = {
        type: 'css',
        selector: `[data-mimic-id="${formActionResult.mimicId}"]`
      };
    } else {
      // If we can't generate the code and no mimicId, log the error
      console.warn('Could not generate Playwright code for form action:', errorMessage);
    }
  }

  // Perform the form action with appropriate plain English annotation
  switch (formActionResult.type) {
    case 'keypress':
      // Validate that keypress is only used for single keys, not text strings
      const keyValue = formActionResult.params.value;
      const validSingleKeys = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
      
      // Handle empty or invalid keypress values
      if (!keyValue || keyValue.trim() === '') {
        // If empty value and step mentions "check", convert to check action
        const stepLower = (gherkinStep || '').toLowerCase();
        if (stepLower.includes('check') || stepLower.includes('select')) {
          console.warn(`⚠️  keypress action received empty value for checkbox operation - converting to check action`);
          annotationDescription = `→ Checking ${elementDescription} to select the option`;
          // Update Playwright code and selector for check action
          // Regenerate selector to ensure we have the best one for this specific action
          try {
            const selectorDescriptor = await generateBestSelectorForElement(targetElement, { timeout: 30000 });
            const selectorCode = selectorToPlaywrightCode(selectorDescriptor);
            playwrightCode = generateFormCode(selectorCode, 'check');
            // Store the updated selector descriptor
            selector = selectorDescriptor;
          } catch (error) {
            // Fallback to mimicId if available
            if (formActionResult.mimicId) {
              const selectorCode = `page.locator('[data-mimic-id="${formActionResult.mimicId}"]')`;
              playwrightCode = generateFormCode(selectorCode, 'check');
              // Ensure selector is set even in fallback case
              if (!selector) {
                selector = {
                  type: 'css',
                  selector: `[data-mimic-id="${formActionResult.mimicId}"]`
                };
              }
            } else {
              console.debug('Could not generate Playwright code for check action:', error);
            }
          }
          addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
          await targetElement.check();
        } else {
          throw new Error(`keypress action requires a valid key value, but received empty string. Use 'check' for checkboxes, 'fill' for text input, etc.`);
        }
      } else if (keyValue.length > 1 && !validSingleKeys.includes(keyValue)) {
        // If it's not a valid single key and looks like text, use fill instead
        console.warn(`⚠️  keypress action received text "${keyValue}" - converting to fill action`);
        annotationDescription = `→ Filling ${elementDescription} with value "${keyValue}"`;
        // Update Playwright code and selector for fill action
        // Regenerate selector to ensure we have the best one for this specific action
        try {
          const selectorDescriptor = await generateBestSelectorForElement(targetElement, { timeout: 30000 });
          const selectorCode = selectorToPlaywrightCode(selectorDescriptor);
          playwrightCode = generateFormCode(selectorCode, 'fill', keyValue);
          // Store the updated selector descriptor
          selector = selectorDescriptor;
        } catch (error) {
          // Fallback to mimicId if available
          if (formActionResult.mimicId) {
            const selectorCode = `page.locator('[data-mimic-id="${formActionResult.mimicId}"]')`;
            playwrightCode = generateFormCode(selectorCode, 'fill', keyValue);
            // Ensure selector is set even in fallback case
            if (!selector) {
              selector = {
                type: 'css',
                selector: `[data-mimic-id="${formActionResult.mimicId}"]`
              };
            }
          } else {
            console.debug('Could not generate Playwright code for fill action:', error);
          }
        }
        addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
        await targetElement.fill(keyValue);
      } else {
        annotationDescription = `→ Pressing key "${keyValue}" on the keyboard`;
        // For keypress action, ensure we have a selector stored even though we use page.keyboard
        // This ensures we have a selector stored for snapshot/replay purposes
        if (!selector) {
          // If selector wasn't generated earlier, try to generate it now
          try {
            selector = await generateBestSelectorForElement(targetElement, { timeout: 30000 });
            const selectorCode = selectorToPlaywrightCode(selector);
            // Use the selector to focus the element before pressing key
            playwrightCode = `${selectorCode}.focus();\nawait page.keyboard.press(${JSON.stringify(keyValue)});`;
          } catch (error) {
            // Fallback to mimicId if available
            if (formActionResult.mimicId) {
              const selectorCode = `page.locator('[data-mimic-id="${formActionResult.mimicId}"]')`;
              playwrightCode = `${selectorCode}.focus();\nawait page.keyboard.press(${JSON.stringify(keyValue)});`;
              selector = {
                type: 'css',
                selector: `[data-mimic-id="${formActionResult.mimicId}"]`
              };
            } else {
              // Last resort: use generic keyboard press without selector
              playwrightCode = `await page.keyboard.press(${JSON.stringify(keyValue)});`;
              console.warn('Could not generate selector for keypress action, using generic keyboard press');
            }
          }
        } else {
          // Use the already-generated selector
          const selectorCode = selectorToPlaywrightCode(selector);
          playwrightCode = `${selectorCode}.focus();\nawait page.keyboard.press(${JSON.stringify(keyValue)});`;
        }
        addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
        // Focus the element first, then press the key
        await targetElement.focus();
        await page.keyboard.press(keyValue);
      }
      break;
    case 'type':
      annotationDescription = `→ Typing "${formActionResult.params.value}" using keyboard input`;
      // For type action, we still want to use the generated selector for the target element
      // even though the actual action uses page.keyboard.type
      // This ensures we have a selector stored for snapshot/replay purposes
      if (!selector) {
        // If selector wasn't generated earlier, try to generate it now
        try {
          selector = await generateBestSelectorForElement(targetElement, { timeout: 30000 });
          const selectorCode = selectorToPlaywrightCode(selector);
          // Use the selector to focus the element before typing
          playwrightCode = `${selectorCode}.focus();\nawait page.keyboard.type(${JSON.stringify(formActionResult.params.value)});`;
        } catch (error) {
          // Fallback to mimicId if available
          if (formActionResult.mimicId) {
            const selectorCode = `page.locator('[data-mimic-id="${formActionResult.mimicId}"]')`;
            playwrightCode = `${selectorCode}.focus();\nawait page.keyboard.type(${JSON.stringify(formActionResult.params.value)});`;
            selector = {
              type: 'css',
              selector: `[data-mimic-id="${formActionResult.mimicId}"]`
            };
          } else {
            // Last resort: use generic keyboard type without selector
            playwrightCode = `await page.keyboard.type(${JSON.stringify(formActionResult.params.value)});`;
            console.warn('Could not generate selector for type action, using generic keyboard type');
          }
        }
      } else {
        // Use the already-generated selector
        const selectorCode = selectorToPlaywrightCode(selector);
        playwrightCode = `${selectorCode}.focus();\nawait page.keyboard.type(${JSON.stringify(formActionResult.params.value)});`;
      }
      addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
      // Focus the element first, then type
      await targetElement.focus();
      await page.keyboard.type(formActionResult.params.value);
      break;
    case 'fill':
      annotationDescription = `→ Filling ${elementDescription} with value "${formActionResult.params.value}"`;
      addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
      await targetElement.fill(formActionResult.params.value);
      break;
    case 'select':
      annotationDescription = `→ Selecting option "${formActionResult.params.value}" from ${elementDescription}`;
      addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
      await targetElement.selectOption(formActionResult.params.value);
      break;
    case 'uncheck':
      annotationDescription = `→ Unchecking ${elementDescription} to deselect the option`;
      addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
      await targetElement.uncheck();
      break;
    case 'check':
      annotationDescription = `→ Checking ${elementDescription} to select the option`;
      addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
      await targetElement.check();
      break;
    case 'click':
      annotationDescription = `→ Clicking on ${elementDescription} to select the radio button`;
      addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
      await targetElement.click();
      break;
    case 'setInputFiles':
      annotationDescription = `→ Uploading file "${formActionResult.params.value}" to ${elementDescription}`;
      addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
      await targetElement.setInputFiles(formActionResult.params.value);
      break;
    case 'clear':
      annotationDescription = `→ Clearing the contents of ${elementDescription}`;
      addAnnotation(testInfo, gherkinStep, annotationDescription, playwrightCode);
      await targetElement.clear();
      break;
    default:
      throw new Error(`Unknown form action type: ${formActionResult.type}`);
  }
  
  // Ensure selector is always set before returning
  // This is critical for snapshot storage and replay functionality
  if (!selector) {
    // Last resort: use mimicId as fallback selector
    if (formActionResult.mimicId) {
      selector = {
        type: 'css',
        selector: `[data-mimic-id="${formActionResult.mimicId}"]`
      };
      console.warn(`⚠️  Using mimicId fallback selector for form action: ${formActionResult.type}`);
    } else {
      throw new Error(`Could not generate or determine selector for form action: ${formActionResult.type}. This is required for snapshot storage.`);
    }
  }
  
  // Return action result and selector for snapshot storage
  return { actionResult: formActionResult, selector };
}