import { Page } from '@playwright/test';

/**
 * Extract ARIA role type from Playwright's getByRole method signature
 * This ensures we always match Playwright's exact role type definition
 */
export type AriaRole = Parameters<Page['getByRole']>[0];

/**
 * JSON-serializable representation of a regex pattern
 * Used when storing selectors to JSON
 */
export interface RegexPattern {
  __regex: true;
  pattern: string;
  flags?: string;
}

/**
 * Type that can be either a string or a regex pattern in JSON format
 * When deserializing from JSON, this will be either a string or RegexPattern object
 */
export type StringOrRegexJson = string | RegexPattern;

/**
 * Runtime representation of StringOrRegex (for use with Playwright APIs)
 * This is what we convert to when we need to use the value with Playwright
 */
export type StringOrRegex = string | RegExp;

/**
 * Selector found via data-testid attribute
 */
export interface TestIdSelector {
  type: 'testid';
  value: string;
  child?: SelectorDescriptor;
}

/**
 * Selector found via ARIA role
 */
export interface RoleSelector {
  type: 'role';
  /** ARIA role - must be one of the valid Playwright role types */
  role: AriaRole;
  /** Optional name parameter (aria-label, label, or text) - stored as JSON format */
  name?: StringOrRegexJson;
  /** Whether name match should be exact (ignored if name is a RegExp) */
  exact?: boolean;
  /** Index for nth() when multiple elements match (0-based) - used for radio groups, checkbox groups, etc. */
  nth?: number;
  child?: SelectorDescriptor;
}

/**
 * Selector found via label association
 */
export interface LabelSelector {
  type: 'label';
  /** Label value - stored as JSON format */
  value: StringOrRegexJson;
  /** Whether label match should be exact (ignored if value is a RegExp) */
  exact?: boolean;
  /** Index for nth() when multiple elements match (0-based) */
  nth?: number;
  child?: SelectorDescriptor;
}

/**
 * Selector found via placeholder attribute
 */
export interface PlaceholderSelector {
  type: 'placeholder';
  /** Placeholder value - stored as JSON format */
  value: StringOrRegexJson;
  /** Whether placeholder match should be exact (ignored if value is a RegExp) */
  exact?: boolean;
  child?: SelectorDescriptor;
}

/**
 * Selector found via alt attribute
 */
export interface AltTextSelector {
  type: 'alt';
  /** Alt text value - stored as JSON format */
  value: StringOrRegexJson;
  /** Whether alt match should be exact (ignored if value is a RegExp) */
  exact?: boolean;
  child?: SelectorDescriptor;
}

/**
 * Selector found via title attribute
 */
export interface TitleSelector {
  type: 'title';
  /** Title value - stored as JSON format */
  value: StringOrRegexJson;
  /** Whether title match should be exact (ignored if value is a RegExp) */
  exact?: boolean;
  child?: SelectorDescriptor;
}

/**
 * Selector found via visible text content
 */
export interface TextSelector {
  type: 'text';
  /** Text value - stored as JSON format */
  value: StringOrRegexJson;
  /** Whether text match should be exact (ignored if value is a RegExp) */
  exact?: boolean;
  child?: SelectorDescriptor;
}

/**
 * CSS selector fallback (ID, name, tag, etc.)
 */
export interface CssSelector {
  type: 'css';
  selector: string;
  child?: SelectorDescriptor;
}

/**
 * Base selector descriptor - all selectors have a type and can be nested
 * Uses discriminated unions for strict type safety
 * 
 * Note: This type uses JSON-serializable formats (StringOrRegexJson) for all text/regex fields.
 * Use the jsonToStringOrRegex helper to convert to runtime format when needed.
 */
export type SelectorDescriptor = 
  | TestIdSelector
  | RoleSelector
  | LabelSelector
  | PlaceholderSelector
  | AltTextSelector
  | TitleSelector
  | TextSelector
  | CssSelector;

/**
 * Playwright-compatible locator JSON structure matching JsonlLocatorFactory format
 * 
 * This format matches Playwright's internal JSON representation for locators,
 * enabling better compatibility with Playwright's codegen and future tooling.
 * 
 * Structure:
 * - `kind`: The type of locator (role, text, label, etc.)
 * - `body`: The main value (string, RegExp, or regex pattern object)
 * - `options`: Optional configuration (attrs, exact, name, hasText, etc.)
 * - `next`: For chaining multiple locators together
 * 
 * @see https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/recorder/jsonlLocatorFactory.ts
 */
export interface PlaywrightLocatorJson {
  /** Type of locator - matches Playwright's locator kinds */
  kind: 'role' | 'text' | 'label' | 'placeholder' | 'alt' | 'title' | 'test-id' | 'nth' | 'first' | 'last' | 'visible' | 'has-text' | 'has-not-text' | 'has' | 'hasNot' | 'and' | 'or' | 'chain' | 'default';
  /** Main locator value - string, RegExp, or regex pattern object */
  body: string | RegExp | RegexPattern;
  /** Optional configuration for the locator */
  options?: {
    /** Attribute filters (for role selectors) */
    attrs?: { name: string; value: string | boolean | number }[];
    /** Whether to match exactly (for text-based selectors) */
    exact?: boolean;
    /** Name parameter (for role selectors) */
    name?: string | RegExp | RegexPattern;
    /** Text content filter */
    hasText?: string | RegExp | RegexPattern;
    /** Negative text content filter */
    hasNotText?: string | RegExp | RegexPattern;
  };
  /** Next locator in the chain (for nested/child selectors) */
  next?: PlaywrightLocatorJson;
}
