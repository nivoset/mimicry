import { ElementHandle, Locator, Page } from '@playwright/test';
import type { SelectorDescriptor } from './selectorTypes.js';
import { jsonToStringOrRegex } from './selectorSerialization.js';

/**
 * Reconstruct a Playwright Locator from a stored SelectorDescriptor
 * 
 * This function recursively builds a locator from a selector descriptor,
 * handling nested selectors by chaining locator method calls.
 * 
 * The descriptor uses JSON-serializable formats (StringOrRegexJson), which are
 * converted to runtime formats (StringOrRegex) as needed when calling Playwright APIs.
 * 
 * @param page - Playwright Page object (or parent Locator for nested selectors)
 * @param descriptor - SelectorDescriptor (from JSON)
 * @returns Playwright Locator reconstructed from the descriptor
 */
export function getFromSelector(
  page: Page | Locator,
  descriptor: SelectorDescriptor
): Locator {
  let baseLocator: Locator;
  
  // Build base locator based on selector type
  // Both Page and Locator have the same locator methods, so we can call them directly
  switch (descriptor.type) {
    case 'testid':
      baseLocator = page.getByTestId(descriptor.value);
      break;
      
    case 'role':
      if (descriptor.name !== undefined) {
        // Convert JSON format to runtime format for Playwright API
        const nameValue = jsonToStringOrRegex(descriptor.name);
        const isRegex = nameValue instanceof RegExp;
        const roleOptions = isRegex
          ? { name: nameValue }
          : { name: nameValue, exact: descriptor.exact ?? false };
        
        baseLocator = page.getByRole(descriptor.role, roleOptions);
      } else {
        baseLocator = page.getByRole(descriptor.role);
      }
      break;
      
    case 'label':
      {
        // Convert JSON format to runtime format
        const labelValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = labelValue instanceof RegExp;
        const labelOptions = isRegex
          ? {}
          : { exact: descriptor.exact ?? false };
        
        baseLocator = page.getByLabel(labelValue, labelOptions);
      }
      break;
      
    case 'placeholder':
      {
        // Convert JSON format to runtime format
        const placeholderValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = placeholderValue instanceof RegExp;
        const placeholderOptions = isRegex
          ? {}
          : { exact: descriptor.exact ?? false };
        
        baseLocator = page.getByPlaceholder(placeholderValue, placeholderOptions);
      }
      break;
      
    case 'alt':
      {
        // Convert JSON format to runtime format
        const altValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = altValue instanceof RegExp;
        const altOptions = isRegex
          ? {}
          : { exact: descriptor.exact ?? false };
        
        baseLocator = page.getByAltText(altValue, altOptions);
      }
      break;
      
    case 'title':
      {
        // Convert JSON format to runtime format
        const titleValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = titleValue instanceof RegExp;
        const titleOptions = isRegex
          ? {}
          : { exact: descriptor.exact ?? false };
        
        baseLocator = page.getByTitle(titleValue, titleOptions);
      }
      break;
      
    case 'text':
      {
        // Convert JSON format to runtime format
        const textValue = jsonToStringOrRegex(descriptor.value);
        const isRegex = textValue instanceof RegExp;
        const textOptions = isRegex
          ? {}
          : { exact: descriptor.exact ?? false };
        
        baseLocator = page.getByText(textValue, textOptions);
      }
      break;
      
    case 'css':
      baseLocator = page.locator(descriptor.selector);
      break;
      
    default:
      // TypeScript exhaustiveness check - if we reach here, a case is missing
      const _exhaustive: never = descriptor;
      void _exhaustive; // Suppress unused variable warning
      throw new Error(`Unknown selector type: ${(descriptor as any).type}`);
  }
  
  // If there's a nested child selector, recursively build it from the base locator
  if (descriptor.child) {
    return getFromSelector(baseLocator, descriptor.child);
  }
  
  return baseLocator;
}

/**
 * Verify that a selector uniquely identifies the target element
 * 
 * This function checks if a locator built from a SelectorDescriptor matches
 * exactly one element, and optionally verifies it matches the original target element.
 * 
 * @param page - Playwright Page object
 * @param descriptor - SelectorDescriptor to verify
 * @param targetElementHandle - Optional element handle to verify the match is correct
 * @returns Promise resolving to true if selector is unique (and matches target if provided)
 */
export async function verifySelectorUniqueness(
  page: Page,
  descriptor: SelectorDescriptor,
  targetElementHandle?: null | ElementHandle<SVGElement | HTMLElement>
): Promise<boolean> {
  try {
    const locator = getFromSelector(page, descriptor);
    const count = await locator.count();
    
    // Must match exactly one element
    if (count !== 1) {
      return false;
    }
    
    // If target element provided, verify it's the same element
    if (targetElementHandle) {
      const matchedElement = await locator.elementHandle();
      if (!matchedElement) {
        return false;
      }
      
      // Compare elements by checking if they have the same properties
      // We'll compare by getting a unique identifier from both elements
      const targetId = await page.evaluate((el: SVGElement | HTMLElement) => {
        // Create a unique identifier: tag + id + text + position
        const rect = el.getBoundingClientRect();
        return JSON.stringify({
          tag: el.tagName,
          id: el.id,
          text: (el.textContent || '').substring(0, 50),
          position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      }, targetElementHandle);
      
      const matchedId = await page.evaluate((el: SVGElement | HTMLElement) => {
        const rect = el.getBoundingClientRect();
        return JSON.stringify({
          tag: el.tagName,
          id: el.id,
          text: (el.textContent || '').substring(0, 50),
          position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      }, matchedElement);
      
      return targetId === matchedId;
    }
    
    return true;
  } catch (error) {
    // If selector is invalid or throws, it's not unique
    return false;
  }
}
