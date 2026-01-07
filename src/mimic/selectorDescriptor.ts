/**
 * Re-export types for backward compatibility
 */
export type {
  AriaRole,
  StringOrRegex,
  StringOrRegexJson,
  RegexPattern,
  SelectorDescriptor,
  TestIdSelector,
  RoleSelector,
  LabelSelector,
  PlaceholderSelector,
  AltTextSelector,
  TitleSelector,
  TextSelector,
  CssSelector,
} from './selectorTypes.js';

/**
 * Re-export serialization helpers
 */
export {
  stringOrRegexToJson,
  jsonToStringOrRegex,
} from './selectorSerialization.js';

/**
 * Re-export utility functions
 */
export { getFromSelector, verifySelectorUniqueness } from './selectorUtils.js';

/**
 * Re-export selector generation function
 * 
 * Generates a SelectorDescriptor from a Playwright Locator.
 * Analyzes the element and finds the best selector following Playwright's best practices.
 * 
 * @param locator - Playwright Locator pointing to the target element
 * @returns Promise resolving to SelectorDescriptor that uniquely identifies the element
 */
export { generateBestSelectorForElement } from './selector.js';

/**
 * Convenience alias for generateBestSelectorForElement
 * 
 * Generates a SelectorDescriptor from a Playwright Locator.
 * This is a shorter alias for the generateBestSelectorForElement function.
 * 
 * @param locator - Playwright Locator pointing to the target element
 * @returns Promise resolving to SelectorDescriptor that uniquely identifies the element
 */
import { generateBestSelectorForElement as _generateBestSelectorForElement } from './selector.js';
import type { Locator } from '@playwright/test';

export async function getSelectorDescriptor(locator: Locator) {
  return _generateBestSelectorForElement(locator);
}
