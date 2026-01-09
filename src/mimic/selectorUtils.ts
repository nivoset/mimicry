import { Locator, Page } from '@playwright/test';
import type { SelectorDescriptor } from './selectorTypes.js';
import { jsonToStringOrRegex } from './selectorSerialization.js';
import { getMimic } from './markers.js';

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
      // Apply nth() if specified (for radio groups, checkbox groups, etc.)
      if (descriptor.nth !== undefined) {
        baseLocator = baseLocator.nth(descriptor.nth);
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
        // Apply nth() if specified
        if (descriptor.nth !== undefined) {
          baseLocator = baseLocator.nth(descriptor.nth);
        }
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
 * Get the mimic ID from a locator
 * 
 * Retrieves the data-mimic-id attribute value from the element
 * that the locator points to. This ID is assigned by the markers system.
 * 
 * @param locator - Playwright Locator to get the mimic ID from
 * @returns Promise resolving to the mimic ID number, or null if not found
 */
export async function getMimicIdFromLocator(
  locator: Locator
): Promise<number | null> {
  try {
    // Evaluate directly on the locator to get the mimic ID attribute
    const mimicId = await locator.evaluate((el: Element) => {
      const idAttr = el.getAttribute('data-mimic-id');
      return idAttr ? Number(idAttr) : null;
    });
    return mimicId;
  } catch (error) {
    // If element not found or error occurs, return null
    return null;
  }
}

/**
 * Verify that a selector uniquely identifies the target element
 * 
 * This function checks if a locator built from a SelectorDescriptor matches
 * exactly one element, and optionally verifies it matches the target element
 * using the markers system (mimic ID).
 * 
 * The function saves the nested Locator type returned by getFromSelector,
 * which can be used for further operations on the matched element.
 * 
 * @param page - Playwright Page object
 * @param descriptor - SelectorDescriptor to verify
 * @param targetMimicId - Optional mimic ID to verify the match is correct
 * @param timeout - Optional timeout in milliseconds for locator operations (default: 300000 = 5 minutes)
 * @returns Promise resolving to an object with:
 *   - unique: true if selector is unique (and matches target if provided)
 *   - locator: The Locator returned by getFromSelector (nested type preserved)
 */
export async function verifySelectorUniqueness(
  page: Page,
  descriptor: SelectorDescriptor,
  targetMimicId?: null | number,
  timeout?: number
): Promise<{ unique: boolean; locator: Locator; count?: number; index?: number | undefined }> {
  // Default to 5 minutes for slow tests
  const operationTimeout = timeout ?? 300000;
  
  try {
    // Get the locator from the selector descriptor (preserves nested type)
    const locator = getFromSelector(page, descriptor);
    // count() doesn't support timeout, but it's typically fast
    // The main timeout-sensitive operations are elementHandle() calls below
    const count = await locator.count();
    
    // Must match exactly one element
    if (count !== 1) {
      // If multiple matches and we have a target mimic ID, find the index
      let index: number | undefined;
      if (count > 1 && targetMimicId !== null && targetMimicId !== undefined) {
        // Find which index matches the target element
        for (let i = 0; i < count; i++) {
          const nthLocator = locator.nth(i);
          const mimicId = await getMimicIdFromLocator(nthLocator);
          if (mimicId === targetMimicId) {
            index = i;
            break;
          }
        }
      }
      // Only include index if it's defined
      const result: { unique: boolean; locator: Locator; count: number; index?: number } = {
        unique: false,
        locator,
        count,
      };
      if (index !== undefined) {
        result.index = index;
      }
      return result;
    }
    
    // If target mimic ID provided, verify it's the same element
    if (targetMimicId !== null && targetMimicId !== undefined) {
      // Get the mimic ID from the matched locator
      const matchedMimicId = await getMimicIdFromLocator(locator);
      
      // If no mimic ID found on matched element, verification fails
      if (matchedMimicId === null) {
        return { unique: false, locator };
      }
      
      // Verify the mimic IDs match
      if (matchedMimicId !== targetMimicId) {
        return { unique: false, locator };
      }
      
      // Additional verification: ensure the locator from getMimic matches
      // This double-checks that the selector correctly identifies the element
      const markerLocator = getMimic(page, targetMimicId);
      // count() doesn't support timeout, but it's typically fast
      const markerCount = await markerLocator.count();
      
      if (markerCount !== 1) {
        return { unique: false, locator };
      }
      
      // Verify both locators point to the same element by comparing their positions
      const locatorElement = await locator.elementHandle({ timeout: operationTimeout });
      const markerElement = await markerLocator.elementHandle({ timeout: operationTimeout });
      
      if (!locatorElement || !markerElement) {
        return { unique: false, locator };
      }
      
      // Compare elements by their mimic IDs (most reliable)
      const locatorMimicId = await page.evaluate((el: Element) => {
        return el.getAttribute('data-mimic-id');
      }, locatorElement);
      
      const markerMimicId = await page.evaluate((el: Element) => {
        return el.getAttribute('data-mimic-id');
      }, markerElement);
      
      if (locatorMimicId !== markerMimicId || locatorMimicId !== String(targetMimicId)) {
        return { unique: false, locator };
      }
    }
    
    return { unique: true, locator, count: 1 };
  } catch (error) {
    // If selector is invalid or throws, it's not unique
    // Still return the locator for potential use
    try {
      const locator = getFromSelector(page, descriptor);
      return { unique: false, locator, count: 0 };
    } catch {
      // If we can't even create the locator, return a dummy one
      // This shouldn't happen in practice, but TypeScript requires a return
      return { unique: false, locator: page.locator('body'), count: 0 };
    }
  }
}
