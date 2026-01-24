/**
 * Playwright Code Generator
 * 
 * Converts SelectorDescriptor and action information into equivalent Playwright code strings
 * for test annotations and documentation purposes.
 */

import type { SelectorDescriptor } from './selectorTypes.js';
import { jsonToStringOrRegex } from './selectorSerialization.js';

/**
 * Convert a SelectorDescriptor to a Playwright code string
 * 
 * Generates the equivalent Playwright locator code that would be used to select
 * the element described by the SelectorDescriptor.
 * 
 * @param descriptor - SelectorDescriptor to convert
 * @param baseVar - Base variable name to use (default: 'page')
 * @returns Playwright code string representing the locator
 * 
 * @example
 * ```typescript
 * const code = selectorToPlaywrightCode({
 *   type: 'role',
 *   role: 'button',
 *   name: 'Submit'
 * });
 * // Returns: "page.getByRole('button', { name: 'Submit' })"
 * ```
 */
export function selectorToPlaywrightCode(
  descriptor: SelectorDescriptor,
  baseVar: string = 'page'
): string {
  let code = baseVar;
  
  // Build base locator code based on selector type
  switch (descriptor.type) {
    case 'testid':
      code += `.getByTestId(${JSON.stringify(descriptor.value)})`;
      break;
      
    case 'role':
      if (descriptor.name !== undefined) {
        const nameValue = jsonToStringOrRegex(descriptor.name);
        const isRegex = nameValue instanceof RegExp;
        
        if (isRegex) {
          // For regex, show the pattern
          const pattern = nameValue.source;
          const flags = nameValue.flags;
          code += `.getByRole(${JSON.stringify(descriptor.role)}, { name: /${pattern}/${flags} })`;
        } else {
          // For string, include exact option if specified
          const options: string[] = [`name: ${JSON.stringify(nameValue)}`];
          if (descriptor.exact) {
            options.push('exact: true');
          }
          code += `.getByRole(${JSON.stringify(descriptor.role)}, { ${options.join(', ')} })`;
        }
      } else {
        code += `.getByRole(${JSON.stringify(descriptor.role)})`;
      }
      // Add .nth() if specified (for radio groups, checkbox groups, etc.)
      if (descriptor.nth !== undefined) {
        code += `.nth(${descriptor.nth})`;
      }
      break;
      
    case 'label':
      {
        const labelValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = labelValue instanceof RegExp;
        
        if (isRegex) {
          const pattern = labelValue.source;
          const flags = labelValue.flags;
          code += `.getByLabel(/${pattern}/${flags})`;
        } else {
          const options: string[] = [];
          if (descriptor.exact) {
            options.push('exact: true');
          }
          const optionsStr = options.length > 0 ? `, { ${options.join(', ')} }` : '';
          code += `.getByLabel(${JSON.stringify(labelValue)}${optionsStr})`;
        }
        // Add .nth() if specified
        if (descriptor.nth !== undefined) {
          code += `.nth(${descriptor.nth})`;
        }
      }
      break;
      
    case 'placeholder':
      {
        const placeholderValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = placeholderValue instanceof RegExp;
        
        if (isRegex) {
          const pattern = placeholderValue.source;
          const flags = placeholderValue.flags;
          code += `.getByPlaceholder(/${pattern}/${flags})`;
        } else {
          const options: string[] = [];
          if (descriptor.exact) {
            options.push('exact: true');
          }
          const optionsStr = options.length > 0 ? `, { ${options.join(', ')} }` : '';
          code += `.getByPlaceholder(${JSON.stringify(placeholderValue)}${optionsStr})`;
        }
      }
      break;
      
    case 'alt':
      {
        const altValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = altValue instanceof RegExp;
        
        if (isRegex) {
          const pattern = altValue.source;
          const flags = altValue.flags;
          code += `.getByAltText(/${pattern}/${flags})`;
        } else {
          const options: string[] = [];
          if (descriptor.exact) {
            options.push('exact: true');
          }
          const optionsStr = options.length > 0 ? `, { ${options.join(', ')} }` : '';
          code += `.getByAltText(${JSON.stringify(altValue)}${optionsStr})`;
        }
      }
      break;
      
    case 'title':
      {
        const titleValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = titleValue instanceof RegExp;
        
        if (isRegex) {
          const pattern = titleValue.source;
          const flags = titleValue.flags;
          code += `.getByTitle(/${pattern}/${flags})`;
        } else {
          const options: string[] = [];
          if (descriptor.exact) {
            options.push('exact: true');
          }
          const optionsStr = options.length > 0 ? `, { ${options.join(', ')} }` : '';
          code += `.getByTitle(${JSON.stringify(titleValue)}${optionsStr})`;
        }
      }
      break;
      
    case 'text':
      {
        const textValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = textValue instanceof RegExp;
        
        if (isRegex) {
          const pattern = textValue.source;
          const flags = textValue.flags;
          code += `.getByText(/${pattern}/${flags})`;
        } else {
          const options: string[] = [];
          if (descriptor.exact) {
            options.push('exact: true');
          }
          const optionsStr = options.length > 0 ? `, { ${options.join(', ')} }` : '';
          code += `.getByText(${JSON.stringify(textValue)}${optionsStr})`;
        }
      }
      break;
      
    case 'css':
      code += `.locator(${JSON.stringify(descriptor.selector)})`;
      break;
      
    default:
      const _exhaustive: never = descriptor;
      void _exhaustive;
      throw new Error(`Unknown selector type: ${(descriptor as any).type}`);
  }
  
  // Handle nested child selectors recursively
  if (descriptor.child) {
    // For nested selectors, chain the child selector
    code = selectorToPlaywrightCode(descriptor.child, code);
  }
  
  return code;
}

/**
 * Generate Playwright code for a click action
 * 
 * @param selectorCode - Playwright locator code string
 * @param clickType - Type of click action ('left', 'right', 'double', 'middle', 'hover')
 * @returns Playwright code string for the click action
 */
export function generateClickCode(
  selectorCode: string,
  clickType: 'primary' | 'secondary' | 'tertiary' | 'double' | 'hover'
): string {
  switch (clickType) {
    case 'primary':
      return `await ${selectorCode}.click();`;
    case 'secondary':
      return `await ${selectorCode}.click({ button: 'right' });`;
    case 'double':
      return `await ${selectorCode}.dblclick();`;
    case 'tertiary':
      return `await ${selectorCode}.click({ button: 'middle' });`;
    case 'hover':
      return `await ${selectorCode}.hover();`;
    default:
      throw new Error(`Unknown click type: ${clickType}`);
  }
}

/**
 * Generate Playwright code for a form action
 * 
 * @param selectorCode - Playwright locator code string
 * @param actionType - Type of form action
 * @param value - Value to use for the action (if applicable)
 * @returns Playwright code string for the form action
 */
export function generateFormCode(
  selectorCode: string,
  actionType: 'keypress' | 'type' | 'fill' | 'select' | 'uncheck' | 'check' | 'click' | 'setInputFiles' | 'clear',
  value?: string
): string {
  switch (actionType) {
    case 'fill':
      return `await ${selectorCode}.fill(${JSON.stringify(value || '')});`;
    case 'type':
      // Type action uses page.keyboard, not the element selector
      return `await page.keyboard.type(${JSON.stringify(value || '')});`;
    case 'select':
      return `await ${selectorCode}.selectOption(${JSON.stringify(value || '')});`;
    case 'check':
      return `await ${selectorCode}.check();`;
    case 'uncheck':
      return `await ${selectorCode}.uncheck();`;
    case 'click':
      return `await ${selectorCode}.click();`;
    case 'clear':
      return `await ${selectorCode}.clear();`;
    case 'setInputFiles':
      return `await ${selectorCode}.setInputFiles(${JSON.stringify(value || '')});`;
    case 'keypress':
      return `await page.keyboard.press(${JSON.stringify(value || '')});`;
    default:
      throw new Error(`Unknown form action type: ${actionType}`);
  }
}

/**
 * Generate Playwright code for a navigation action
 * 
 * @param actionType - Type of navigation action
 * @param url - URL for navigate/openPage actions (optional)
 * @param newWindow - If true, opens URL in a new browser window/tab (optional)
 * @returns Playwright code string for the navigation action
 */
export function generateNavigationCode(
  actionType: 'openPage' | 'navigate' | 'closePage' | 'goBack' | 'goForward' | 'refresh',
  url?: string,
  newWindow?: boolean
): string {
  switch (actionType) {
    case 'openPage':
    case 'navigate':
      if (newWindow) {
        // Generate code for opening in a new window/tab
        if (url) {
          return `const newPage = await page.context().newPage();\nawait newPage.goto(${JSON.stringify(url)}, { waitUntil: 'networkidle' });`;
        }
        return `const newPage = await page.context().newPage();\nawait newPage.goto(url, { waitUntil: 'networkidle' });`;
      } else {
        // Generate code for normal navigation
        if (url) {
          return `await page.goto(${JSON.stringify(url)}, { waitUntil: 'networkidle' });`;
        }
        return `await page.goto(url, { waitUntil: 'networkidle' });`;
      }
    case 'closePage':
      return `await page.close();`;
    case 'goBack':
      return `await page.goBack();`;
    case 'goForward':
      return `await page.goForward();`;
    case 'refresh':
      return `await page.reload();`;
    default:
      throw new Error(`Unknown navigation action type: ${actionType}`);
  }
}

/**
 * Generate Playwright code for an assertion action
 * 
 * @param selectorCode - Playwright locator code string (null for page-level assertions)
 * @param assertionType - Type of assertion action
 * @param expected - Expected value for the assertion
 * @param normalizeDynamicContent - Whether to normalize dynamic content (for text assertions)
 * @returns Playwright code string for the assertion action
 */
export function generateAssertionCode(
  selectorCode: string | null,
  assertionType: 'visible' | 'notVisible' | 'text' | 'textContains' | 'value' | 'checked' | 'notChecked' | 'enabled' | 'disabled' | 'count' | 'url' | 'title',
  expected: string,
  normalizeDynamicContent: boolean = false
): string {
  switch (assertionType) {
    case 'visible':
      if (!selectorCode) {
        throw new Error('Visibility assertion requires a selector');
      }
      return `await expect(${selectorCode}).toBeVisible();`;
    case 'notVisible':
      if (!selectorCode) {
        throw new Error('Not visible assertion requires a selector');
      }
      return `await expect(${selectorCode}).not.toBeVisible();`;
    case 'text':
      if (!selectorCode) {
        throw new Error('Text assertion requires a selector');
      }
      if (normalizeDynamicContent) {
        // Note: normalizeDynamicText would need to be called at runtime
        return `await expect(${selectorCode}).toHaveText(${JSON.stringify(expected)}); // Note: normalizeDynamicContent=true, may need custom normalization`;
      }
      return `await expect(${selectorCode}).toHaveText(${JSON.stringify(expected)});`;
    case 'textContains':
      if (!selectorCode) {
        throw new Error('Text contains assertion requires a selector');
      }
      if (normalizeDynamicContent) {
        return `await expect(${selectorCode}).toContainText(${JSON.stringify(expected)}); // Note: normalizeDynamicContent=true, may need custom normalization`;
      }
      return `await expect(${selectorCode}).toContainText(${JSON.stringify(expected)});`;
    case 'value':
      if (!selectorCode) {
        throw new Error('Value assertion requires a selector');
      }
      return `await expect(${selectorCode}).toHaveValue(${JSON.stringify(expected)});`;
    case 'checked':
      if (!selectorCode) {
        throw new Error('Checked assertion requires a selector');
      }
      return `await expect(${selectorCode}).toBeChecked();`;
    case 'notChecked':
      if (!selectorCode) {
        throw new Error('Not checked assertion requires a selector');
      }
      return `await expect(${selectorCode}).not.toBeChecked();`;
    case 'enabled':
      if (!selectorCode) {
        throw new Error('Enabled assertion requires a selector');
      }
      return `await expect(${selectorCode}).toBeEnabled();`;
    case 'disabled':
      if (!selectorCode) {
        throw new Error('Disabled assertion requires a selector');
      }
      return `await expect(${selectorCode}).toBeDisabled();`;
    case 'count':
      if (!selectorCode) {
        throw new Error('Count assertion requires a selector');
      }
      const count = parseInt(expected, 10);
      if (isNaN(count)) {
        throw new Error(`Invalid count value: ${expected}`);
      }
      return `expect(await ${selectorCode}.count()).toBe(${count});`;
    case 'url':
      return `await expect(page).toHaveURL(${JSON.stringify(expected)});`;
    case 'title':
      return `await expect(page).toHaveTitle(${JSON.stringify(expected)});`;
    default:
      throw new Error(`Unknown assertion type: ${assertionType}`);
  }
}
