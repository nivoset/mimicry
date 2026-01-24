/**
 * Element Information Extraction Module
 * 
 * Handles extracting element information from the DOM in browser context.
 * All DOM extraction logic is kept in browser context to avoid serialization issues.
 */

import { Locator, Page } from '@playwright/test';
import { logger } from './logger.js';

/**
 * Element information extracted from the DOM
 * 
 * Contains all relevant attributes and properties needed for selector generation
 */
export interface ElementInfo {
  /** HTML tag name (lowercase) */
  tag: string;
  /** Visible text content (normalized, whitespace collapsed) */
  text: string;
  /** Element ID attribute */
  id: string | null;
  /** Inferred or explicit ARIA role */
  role: string | null;
  /** Associated label text (from aria-label, aria-labelledby, label[for], or parent label) */
  label: string | null;
  /** aria-label attribute value */
  ariaLabel: string | null;
  /** placeholder attribute value */
  placeholder: string | null;
  /** alt attribute value (for images) */
  alt: string | null;
  /** title attribute value */
  title: string | null;
  /** Input type attribute (for form elements) */
  typeAttr: string | null;
  /** name attribute value */
  nameAttr: string | null;
  /** All data-* attributes converted to camelCase (e.g., data-test-id → testId) */
  dataset: Record<string, string>;
  /** 1-based index among same tag siblings (nth-of-type) */
  nthOfType: number;
}

/**
 * Extract element information from a Playwright locator
 * 
 * Evaluates the element in browser context to extract all relevant information
 * needed for selector generation. All logic is kept inline to avoid serialization
 * issues with nested functions.
 * 
 * @param locator - Playwright Locator pointing to the element
 * @returns Promise resolving to ElementInfo object
 * @throws Error if page is closed or element cannot be evaluated
 * 
 * @example
 * ```typescript
 * const info = await extractElementInfo(page.locator('button'));
 * console.log(info.tag); // 'button'
 * console.log(info.text); // 'Click me'
 * ```
 */
export async function extractElementInfo(locator: Locator): Promise<ElementInfo> {
  const page = locator.page();
  
  // Check if page is closed before attempting evaluation
  if (page.isClosed()) {
    throw new Error(
      'Cannot extract element info: page, context or browser has been closed. ' +
      'This may happen if a previous action closed the page unexpectedly.'
    );
  }
  
  // Get element handle for evaluation
  let elementHandle;
  try {
    elementHandle = await locator.elementHandle({ timeout: 30000 });
  } catch (error: any) {
    if (page.isClosed() || (error?.message && error.message.includes('closed'))) {
      throw new Error(
        'Cannot get element handle: page, context or browser has been closed. ' +
        'This may happen if a previous action closed the page unexpectedly.'
      );
    }
    throw error;
  }
  
  if (!elementHandle) {
    throw new Error('Cannot get element handle from locator');
  }
  
  // Double-check page is still open before evaluate
  if (page.isClosed()) {
    throw new Error(
      'Page closed before evaluation: page, context or browser has been closed. ' +
      'This may happen if a previous action closed the page unexpectedly.'
    );
  }
  
  // Extract element information in browser context
  // All logic is kept inline to avoid nested functions that get transformed by toolchain
  let elementInfo: ElementInfo;
  try {
    elementInfo = await page.evaluate((element) => {
      // @ts-ignore - window is available in browser context
      const win = window;
      // @ts-ignore - document is available in browser context
      const doc = document;
      
      // Get visible text - inline logic
      const style = win.getComputedStyle(element);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      const text = isVisible ? (element.textContent || '').trim().replace(/\s+/g, ' ') : '';
      
      // Get label - inline logic
      let label = null;
      const ariaLabelAttr = element.getAttribute('aria-label');
      if (ariaLabelAttr) {
        label = ariaLabelAttr.trim();
      } else {
        const labelledBy = element.getAttribute('aria-labelledby');
        if (labelledBy) {
          const labelEl = doc.getElementById(labelledBy);
          if (labelEl) label = (labelEl.textContent || '').trim();
        }
        if (!label && element.id) {
          const labelFor = doc.querySelector('label[for="' + element.id + '"]');
          if (labelFor) label = (labelFor.textContent || '').trim();
        }
        if (!label) {
          const parentLabel = element.closest('label');
          if (parentLabel) label = (parentLabel.textContent || '').trim();
        }
      }
      
      // Infer role - inline logic
      let role = element.getAttribute('role');
      if (!role) {
        const tag = element.tagName.toLowerCase();
        if (tag === 'button') {
          role = 'button';
        } else if (tag === 'a') {
          role = 'link';
        } else if (tag === 'input') {
          const inputType = (element as any).type;
          if (inputType === 'button' || inputType === 'submit' || inputType === 'reset') {
            role = 'button';
          } else if (inputType === 'checkbox') {
            role = 'checkbox';
          } else if (inputType === 'radio') {
            role = 'radio';
          } else {
            role = 'textbox';
          }
        } else if (tag === 'select') {
          role = 'combobox';
        } else if (tag === 'textarea') {
          role = 'textbox';
        } else if (tag === 'img') {
          role = 'img';
        }
      }
      
      // Get dataset - inline logic with simple replace (no arrow function)
      const dataset: Record<string, string> = {};
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        if (attr && attr.name && attr.name.startsWith('data-')) {
          // Convert data-test-id to testId (camelCase) - using simple string manipulation
          let key = attr.name.replace(/^data-/, '');
          // Replace -x with X (camelCase conversion)
          let result = '';
          let capitalizeNext = false;
          for (let j = 0; j < key.length; j++) {
            const char = key[j];
            if (char) {
              if (char === '-') {
                capitalizeNext = true;
              } else {
                result += capitalizeNext ? char.toUpperCase() : char;
                capitalizeNext = false;
              }
            }
          }
          dataset[result] = attr.value;
        }
      }
      
      // Get nth-of-type - inline logic
      const tagName = element.tagName;
      let nthOfType = 1;
      let sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === tagName) {
          nthOfType++;
        }
        sibling = sibling.previousElementSibling;
      }
      
      return {
        tag: element.tagName.toLowerCase(),
        text: text,
        id: element.id || null,
        role: role,
        label: label,
        ariaLabel: element.getAttribute('aria-label') || null,
        placeholder: element.getAttribute('placeholder') || null,
        alt: element.getAttribute('alt') || null,
        title: element.getAttribute('title') || null,
        typeAttr: (element as any).type || null,
        nameAttr: element.getAttribute('name') || null,
        dataset: dataset,
        nthOfType: nthOfType,
      };
    }, elementHandle);
  } catch (error: any) {
    // Enhanced error reporting to help identify the exact location of the issue
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || '';
    
    // Check if page is closed - this is a common issue
    if (page.isClosed() || errorMessage.includes('closed') || errorMessage.includes('Target page')) {
      throw new Error(
        `Cannot extract element info: page, context or browser has been closed. ` +
        `This may happen if a previous action (like form submission or navigation) closed the page unexpectedly. ` +
        `Original error: ${errorMessage}`
      );
    }
    
    // Check if this is the __name error (TypeScript type annotation issue)
    if (errorMessage.includes('__name') || errorStack.includes('__name')) {
      logger.error({ errorMessage, errorStack }, 'Error in extractElementInfo - page.evaluate failed');
      logger.error({ errorMessage }, `Error message: ${errorMessage}`);
      logger.error({ errorStack }, `Error stack: ${errorStack}`);
      logger.error('This error typically occurs when TypeScript type annotations are used in arrow functions within page.evaluate');
      logger.error('Please check for any remaining type annotations in the evaluate function');
    }
    
    throw new Error(
      `Failed to evaluate element in browser context: ${errorMessage}. ` +
      `This may be caused by TypeScript type annotations in the evaluate function. ` +
      `Original error: ${errorStack}`
    );
  }
  
  return elementInfo;
}
