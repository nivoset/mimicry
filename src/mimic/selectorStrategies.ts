/**
 * Selector Generation Strategies Module
 * 
 * Contains selector generation strategies following Playwright's recommended priority order.
 * Each strategy can generate a selector descriptor for a given element.
 */

import { Page } from '@playwright/test';
import type { 
  SelectorDescriptor,
  TestIdSelector,
  RoleSelector,
  LabelSelector,
  PlaceholderSelector,
  AltTextSelector,
  TitleSelector,
  TextSelector,
  CssSelector,
  AriaRole,
} from './selectorTypes.js';
import type { ElementInfo } from './elementInfo.js';
import { verifySelectorUniqueness } from './selectorUtils.js';

/**
 * Result of attempting to generate a selector with a strategy
 */
export interface SelectorGenerationResult {
  /** The generated selector descriptor, or null if strategy cannot be applied */
  descriptor: SelectorDescriptor | null;
  /** Whether the selector is unique (if checked) */
  unique?: boolean | undefined;
  /** Index of the element if not unique but index is available */
  index?: number | undefined;
  /** Count of matching elements */
  count?: number | undefined;
}

/**
 * Strategy interface for selector generation
 */
export interface SelectorStrategy {
  /** Strategy name for debugging */
  name: string;
  /** Priority order (lower = higher priority) */
  priority: number;
  /** Check if this strategy can generate a selector for the element */
  canGenerate(elementInfo: ElementInfo): boolean;
  /** Generate selector descriptor and verify uniqueness */
  generate(
    page: Page,
    elementInfo: ElementInfo,
    targetMimicId: number | null,
    timeout?: number
  ): Promise<SelectorGenerationResult>;
}

/**
 * TestId Strategy (Priority 1)
 * 
 * Uses data-testid attribute - Playwright's #1 recommendation, most stable
 */
export class TestIdStrategy implements SelectorStrategy {
  name = 'testid';
  priority = 1;

  canGenerate(elementInfo: ElementInfo): boolean {
    return !!(elementInfo.dataset && elementInfo.dataset.testid);
  }

  async generate(
    page: Page,
    elementInfo: ElementInfo,
    targetMimicId: number | null,
    timeout?: number
  ): Promise<SelectorGenerationResult> {
    if (!this.canGenerate(elementInfo)) {
      return { descriptor: null };
    }

    const descriptor: TestIdSelector = {
      type: 'testid',
      value: elementInfo.dataset.testid!,
    };

    const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
    // TestIdSelector doesn't support nth property
    return {
      descriptor: verification.unique ? descriptor : descriptor,
      unique: verification.unique,
      index: verification.index,
      count: verification.count,
    };
  }
}

/**
 * Role Strategy (Priority 2)
 * 
 * Uses ARIA role with optional name parameter - Playwright's #2 recommendation
 */
export class RoleStrategy implements SelectorStrategy {
  name = 'role';
  priority = 2;

  canGenerate(elementInfo: ElementInfo): boolean {
    return !!elementInfo.role;
  }

  async generate(
    page: Page,
    elementInfo: ElementInfo,
    targetMimicId: number | null,
    timeout?: number
  ): Promise<SelectorGenerationResult> {
    if (!this.canGenerate(elementInfo)) {
      return { descriptor: null };
    }

    // Determine name parameter priority based on element type
    const isFormElement = ['textbox', 'combobox', 'checkbox', 'radio'].includes(elementInfo.role || '');
    let name: string | null = null;

    if (elementInfo.label || elementInfo.ariaLabel) {
      // For form elements, prefer label > ariaLabel > text
      // For other elements, prefer ariaLabel > label > text
      if (isFormElement) {
        name = elementInfo.label?.trim() || elementInfo.ariaLabel?.trim() || elementInfo.text?.trim() || null;
      } else {
        name = elementInfo.ariaLabel?.trim() || elementInfo.label?.trim() || elementInfo.text?.trim() || null;
      }
    } else {
      // No label/ariaLabel, use placeholder/alt/title/text based on element type
      if (isFormElement) {
        name = elementInfo.placeholder?.trim() || elementInfo.text?.trim() || null;
      } else {
        name = elementInfo.alt?.trim() || elementInfo.title?.trim() || elementInfo.text?.trim() || null;
      }
    }

    // Try with name if available
    if (name && name.trim()) {
      // Try exact match first
      const descriptorExact: RoleSelector = {
        type: 'role',
        role: elementInfo.role as AriaRole,
        name: name.trim(),
        exact: true,
      };
      const verificationExact = await verifySelectorUniqueness(page, descriptorExact, targetMimicId);
      if (verificationExact.unique) {
        return {
          descriptor: descriptorExact,
          unique: true,
          count: verificationExact.count,
        };
      }
      if (verificationExact.index !== undefined && verificationExact.count && verificationExact.count > 1) {
        return {
          descriptor: { ...descriptorExact, nth: verificationExact.index },
          unique: false,
          index: verificationExact.index,
          count: verificationExact.count,
        };
      }

      // Try non-exact match
      const descriptor: RoleSelector = {
        type: 'role',
        role: elementInfo.role as AriaRole,
        name: name.trim(),
        exact: false,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
      if (verification.unique) {
      return {
        descriptor,
        unique: true,
        count: verification.count,
        index: undefined,
      };
      }
      if (verification.index !== undefined && verification.count && verification.count > 1) {
        return {
          descriptor: { ...descriptor, nth: verification.index },
          unique: false,
          index: verification.index,
          count: verification.count,
        };
      }
    }

    // Try role without name (only for non-form elements)
    if (!isFormElement) {
      const descriptor: RoleSelector = {
        type: 'role',
        role: elementInfo.role as AriaRole,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
      if (verification.unique) {
      return {
        descriptor,
        unique: true,
        count: verification.count,
        index: undefined,
      };
      }
    }

    return { descriptor: null };
  }
}

/**
 * Placeholder Strategy (Priority 3)
 * 
 * Uses placeholder attribute - good for form inputs without labels
 */
export class PlaceholderStrategy implements SelectorStrategy {
  name = 'placeholder';
  priority = 3;

  canGenerate(elementInfo: ElementInfo): boolean {
    return !!(elementInfo.placeholder && !elementInfo.label && !elementInfo.ariaLabel);
  }

  async generate(
    page: Page,
    elementInfo: ElementInfo,
    targetMimicId: number | null,
    timeout?: number
  ): Promise<SelectorGenerationResult> {
    if (!this.canGenerate(elementInfo)) {
      return { descriptor: null };
    }

    const descriptor: PlaceholderSelector = {
      type: 'placeholder',
      value: elementInfo.placeholder!.trim(),
      exact: false,
    };

    const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
    // PlaceholderSelector doesn't support nth property
    return {
      descriptor: verification.unique ? descriptor : descriptor,
      unique: verification.unique,
      index: verification.index,
      count: verification.count,
    };
  }
}

/**
 * Alt Strategy (Priority 4)
 * 
 * Uses alt attribute - good for images
 */
export class AltStrategy implements SelectorStrategy {
  name = 'alt';
  priority = 4;

  canGenerate(elementInfo: ElementInfo): boolean {
    return !!(elementInfo.alt && !elementInfo.label && !elementInfo.ariaLabel);
  }

  async generate(
    page: Page,
    elementInfo: ElementInfo,
    targetMimicId: number | null,
    timeout?: number
  ): Promise<SelectorGenerationResult> {
    if (!this.canGenerate(elementInfo)) {
      return { descriptor: null };
    }

    const descriptor: AltTextSelector = {
      type: 'alt',
      value: elementInfo.alt!.trim(),
      exact: false,
    };

    const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
    // AltTextSelector doesn't support nth property, so just return the descriptor
    return {
      descriptor: verification.unique ? descriptor : descriptor,
      unique: verification.unique,
      index: verification.index,
      count: verification.count,
    };
  }
}

/**
 * Title Strategy (Priority 5)
 * 
 * Uses title attribute
 */
export class TitleStrategy implements SelectorStrategy {
  name = 'title';
  priority = 5;

  canGenerate(elementInfo: ElementInfo): boolean {
    return !!(elementInfo.title && !elementInfo.label && !elementInfo.ariaLabel);
  }

  async generate(
    page: Page,
    elementInfo: ElementInfo,
    targetMimicId: number | null,
    timeout?: number
  ): Promise<SelectorGenerationResult> {
    if (!this.canGenerate(elementInfo)) {
      return { descriptor: null };
    }

    const descriptor: TitleSelector = {
      type: 'title',
      value: elementInfo.title!.trim(),
      exact: false,
    };

    const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
    // PlaceholderSelector doesn't support nth property, so just return the descriptor
    return {
      descriptor: verification.unique ? descriptor : descriptor,
      unique: verification.unique,
      index: verification.index,
      count: verification.count,
    };
  }
}

/**
 * Label Strategy (Priority 6)
 * 
 * Uses label association - especially good for form elements
 */
export class LabelStrategy implements SelectorStrategy {
  name = 'label';
  priority = 6;

  canGenerate(elementInfo: ElementInfo): boolean {
    return !!elementInfo.label;
  }

  async generate(
    page: Page,
    elementInfo: ElementInfo,
    targetMimicId: number | null,
    timeout?: number
  ): Promise<SelectorGenerationResult> {
    if (!this.canGenerate(elementInfo)) {
      return { descriptor: null };
    }

    // Try exact match first
    const descriptorExact: LabelSelector = {
      type: 'label',
      value: elementInfo.label!.trim(),
      exact: true,
    };
    const verificationExact = await verifySelectorUniqueness(page, descriptorExact, targetMimicId);
    if (verificationExact.unique) {
      return {
        descriptor: descriptorExact,
        unique: true,
        count: verificationExact.count,
        index: undefined,
      };
    }
    if (verificationExact.index !== undefined && verificationExact.count && verificationExact.count > 1) {
      return {
        descriptor: { ...descriptorExact, nth: verificationExact.index },
        unique: false,
        index: verificationExact.index,
        count: verificationExact.count,
      };
    }

    // Try non-exact match
    const descriptor: LabelSelector = {
      type: 'label',
      value: elementInfo.label!.trim(),
      exact: false,
    };
    const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
    let finalDescriptor: SelectorDescriptor = descriptor;
    // LabelSelector supports nth property
    if (!verification.unique && verification.index !== undefined) {
      finalDescriptor = { ...descriptor, nth: verification.index } as SelectorDescriptor;
    }
    return {
      descriptor: verification.unique ? finalDescriptor : (verification.index !== undefined ? finalDescriptor : descriptor),
      unique: verification.unique,
      index: verification.index,
      count: verification.count,
    };
  }
}

/**
 * Text Strategy (Priority 7)
 * 
 * Uses visible text content
 */
export class TextStrategy implements SelectorStrategy {
  name = 'text';
  priority = 7;

  canGenerate(elementInfo: ElementInfo): boolean {
    return !!(elementInfo.text && elementInfo.text.trim());
  }

  async generate(
    page: Page,
    elementInfo: ElementInfo,
    targetMimicId: number | null,
    timeout?: number
  ): Promise<SelectorGenerationResult> {
    if (!this.canGenerate(elementInfo)) {
      return { descriptor: null };
    }

    const trimmedText = elementInfo.text!.trim();

    // For short text, try exact match
    if (trimmedText.length < 50) {
      const descriptorExact: TextSelector = {
        type: 'text',
        value: trimmedText,
        exact: true,
      };
      const verificationExact = await verifySelectorUniqueness(page, descriptorExact, targetMimicId);
      if (verificationExact.unique) {
        return {
          descriptor: descriptorExact,
          unique: true,
          count: verificationExact.count,
        };
      }
    }

    // Try non-exact match
    const descriptor: TextSelector = {
      type: 'text',
      value: trimmedText,
      exact: false,
    };
    const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
    return {
      descriptor: verification.unique ? descriptor : null,
      unique: verification.unique,
      index: verification.index,
      count: verification.count,
    };
  }
}

/**
 * CSS Strategy (Priority 8)
 * 
 * Fallback to CSS selectors (ID, name, tag + nth-of-type)
 */
export class CssStrategy implements SelectorStrategy {
  name = 'css';
  priority = 8;

  canGenerate(_elementInfo: ElementInfo): boolean {
    // Always available as fallback
    return true;
  }

  async generate(
    page: Page,
    elementInfo: ElementInfo,
    targetMimicId: number | null,
    timeout?: number
  ): Promise<SelectorGenerationResult> {
    // Try name attribute first
    if (elementInfo.nameAttr && elementInfo.nameAttr.trim()) {
      const descriptor: CssSelector = {
        type: 'css',
        selector: `[name="${elementInfo.nameAttr.trim()}"]`,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
      if (verification.unique) {
      return {
        descriptor,
        unique: true,
        count: verification.count,
        index: undefined,
      };
      }
    }

    // Try ID attribute
    if (elementInfo.id && elementInfo.id.trim()) {
      const descriptor: CssSelector = {
        type: 'css',
        selector: `#${elementInfo.id.trim()}`,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId, timeout);
      if (verification.unique) {
      return {
        descriptor,
        unique: true,
        count: verification.count,
        index: undefined,
      };
      }
    }

    // Absolute last resort: nth-of-type CSS selector
    const descriptor: CssSelector = {
      type: 'css',
      selector: `${elementInfo.tag}:nth-of-type(${elementInfo.nthOfType})`,
    };

    return {
      descriptor,
      unique: false, // nth-of-type is never considered "unique" in the same way
      count: undefined,
    };
  }
}

/**
 * All available strategies in priority order
 */
export const allStrategies: SelectorStrategy[] = [
  new TestIdStrategy(),
  new RoleStrategy(),
  new PlaceholderStrategy(),
  new AltStrategy(),
  new TitleStrategy(),
  new LabelStrategy(),
  new TextStrategy(),
  new CssStrategy(),
];

/**
 * Generate selector using strategies in priority order
 * 
 * Tries each strategy in order until one produces a unique selector.
 * Falls back to next strategy if current one doesn't produce unique selector.
 * 
 * @param page - Playwright Page object
 * @param elementInfo - Element information
 * @param targetMimicId - Target mimic ID for verification (optional)
 * @param timeout - Timeout for verification (optional)
 * @returns First successful unique selector, or best available selector
 */
export async function generateSelectorWithStrategies(
  page: Page,
  elementInfo: ElementInfo,
  targetMimicId: number | null = null,
  timeout?: number
): Promise<SelectorDescriptor | null> {
  // Try each strategy in priority order
  let bestNonUniqueSelector: SelectorDescriptor | null = null;
  
  for (const strategy of allStrategies) {
    if (!strategy.canGenerate(elementInfo)) {
      continue;
    }

    const result = await strategy.generate(page, elementInfo, targetMimicId, timeout);
    
    // If we got a unique selector, return it immediately
    if (result.descriptor && result.unique) {
      return result.descriptor;
    }
    
    // If we got a selector with an index (nth), store it as potential fallback
    // but continue trying other strategies to find a unique one
    if (result.descriptor && result.index !== undefined && !bestNonUniqueSelector) {
      bestNonUniqueSelector = result.descriptor;
    }
    
    // If we got a descriptor but it's not unique and has no index, continue to next strategy
    // (This handles cases where strategy generated a selector but it matches multiple elements)
  }

  // If we found a non-unique selector with index, return it
  if (bestNonUniqueSelector) {
    return bestNonUniqueSelector;
  }

  // If no strategy produced a selector, return null (caller will handle fallback)
  return null;
}
