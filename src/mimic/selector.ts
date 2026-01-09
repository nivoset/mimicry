import { Locator, Page } from '@playwright/test';
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
import { verifySelectorUniqueness, getMimicIdFromLocator } from './selectorUtils.js';

/**
 * Browser context types (used in page.evaluate)
 * These types represent the browser DOM APIs available in page.evaluate()
 */
type BrowserElement = any;
type BrowserHTMLAnchorElement = any;

/**
 * Browser Window interface (subset of actual Window API)
 */
interface BrowserWindow {
  getComputedStyle(element: BrowserElement): {
    display: string;
    visibility: string;
    opacity: string;
  };
}

/**
 * Browser Document interface (subset of actual Document API)
 */
interface BrowserDocument {
  body: BrowserElement;
  getElementById(elementId: string): BrowserElement | null;
  querySelector(selectors: string): BrowserElement | null;
  querySelectorAll(selectors: string): BrowserElement[] & { length: number; [Symbol.iterator](): IterableIterator<BrowserElement> };
}

/**
 * TargetInfo: Normalized metadata for a candidate element
 * 
 * This represents an element that could be targeted by a Gherkin step.
 * Collected via Playwright page.evaluate in the browser context.
 */
export type TargetInfo = {
  tag: string;                // 'button', 'a', 'input', 'div', ...
  text: string;               // normalized visible text
  id: string | null;
  role: string | null;        // inferred WAI-ARIA role
  label: string | null;       // associated label or aria-labelledby
  ariaLabel: string | null;
  typeAttr: string | null;    // input type, select etc.
  nameAttr: string | null;
  href: string | null;
  dataset: Record<string, string>;
  nthOfType: number;          // 1-based index among same tag siblings
};

/**
 * Element category types for classification
 */
export type ElementCategory = 'clickable' | 'form' | 'text';

/**
 * Comprehensive element information for selector generation
 */
export interface SelectorElement {
  /** Element category: clickable, form, or text */
  category: ElementCategory;
  /** HTML tag name */
  tag: string;
  /** Primary visible text content */
  text: string;
  /** All text-related attributes combined for context */
  descriptiveText: string;
  /** Element ID if present */
  id: string | null;
  /** Inferred or explicit ARIA role */
  role: string | null;
  /** Associated label text */
  label: string | null;
  /** aria-label attribute */
  ariaLabel: string | null;
  /** alt text for images */
  altText: string | null;
  /** title attribute */
  title: string | null;
  /** placeholder text for inputs */
  placeholder: string | null;
  /** aria-describedby text */
  ariaDescribedBy: string | null;
  /** Input type attribute */
  typeAttr: string | null;
  /** Name attribute */
  nameAttr: string | null;
  /** href for links */
  href: string | null;
  /** value attribute for form elements */
  value: string | null;
  /** All data-* attributes */
  dataset: Record<string, string>;
  /** nth-of-type index (1-based) */
  nthOfType: number;
  /** CSS selector path for this element */
  selector: string;
  /** Whether element is visible */
  isVisible: boolean;
}

type Element = BrowserElement;;
/**
 * Result structure containing all categorized elements
 */
export interface SelectorResult {
  /** All clickable/interactive elements (buttons, links, etc.) */
  clickableElements: SelectorElement[];
  /** All form input elements */
  formElements: SelectorElement[];
  /** All text/content elements */
  textElements: SelectorElement[];
  /** Total count of all elements */
  totalCount: number;
}


/**
 * Options for capturing target elements
 */
export interface CaptureTargetsOptions {
  /**
   * If true, only capture interactable elements (buttons, links, inputs, etc.)
   * If false (default), capture both interactive and content elements
   */
  interactableOnly?: boolean;
}

/**
 * Capture target elements from the page
 * 
 * @param page - Playwright Page object
 * @param options - Optional configuration for capturing targets
 * @returns Promise resolving to array of TargetInfo objects
 */
export async function captureTargets(
  page: Page,
  options: CaptureTargetsOptions = {}
): Promise<TargetInfo[]> {
  const { interactableOnly = false } = options;
  
  return await page.evaluate((interactableOnlyFlag) => {
    const targets: TargetInfo[] = [];
    const interactiveTags = ['button', 'a', 'input', 'select', 'textarea', 'details', 'summary'] as const;
    const interactiveRoles = [
      'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
      'menuitem', 'tab', 'option', 'switch'
    ] as const;

    const interactiveSelectors = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="combobox"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="option"]',
      '[tabindex]:not([tabindex="-1"])',
    ];
    // @ts-ignore - document is not defined in the browser context
    const doc = document as BrowserDocument;
    // @ts-ignore - window is not defined in the browser context
    const win = window as BrowserWindow;
    /**
     * Normalize text content by trimming and collapsing whitespace
     */
    function normalizeText(element: Element): string {
      const text = element.textContent || '';
      return text.trim().replace(/\s+/g, ' ');
    }

    /**
     * Get visible text (excludes hidden elements)
     */
    function getVisibleText(element: Element): string {
      const style = win.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return '';
      }
      return normalizeText(element);
    }

    /**
     * Check if element is interactive
     */
    function isInteractive(element: Element): boolean {
      const tag = element.tagName.toLowerCase();
      
      if (interactiveTags.includes(tag)) {
        return true;
      }

      // Check for interactive ARIA roles
      const role = element.getAttribute('role');

      if (role && interactiveRoles.includes(role)) {
        return true;
      }

      // Check for tabindex (focusable)
      const tabIndex = element.getAttribute('tabindex');
      if (tabIndex !== null && tabIndex !== '-1') {
        return true;
      }

      // Check for click handlers (heuristic)
      const hasOnClick = element.hasAttribute('onclick') || 
                        (element as Element).onclick !== null;
      if (hasOnClick) {
        return true;
      }

      return false;
    }

    /**
     * Check if element has interactive children
     */
    function hasInteractiveChildren(element: Element): boolean {
      const interactive = element.querySelector('button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])');
      return interactive !== null;
    }

    /**
     * Check if element is nested inside an interactive element
     */
    function isNestedInInteractive(element: Element): boolean {
      let parent = element.parentElement;
      while (parent && parent !== doc.body) {
        if (isInteractive(parent)) {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    }

    /**
     * Infer ARIA role from element
     */
    function inferRole(element: BrowserElement): string | null {
      // Explicit role attribute
      const explicitRole = element.getAttribute('role');
      if (explicitRole) {
        return explicitRole;
      }

      // Infer from tag
      const tag = element.tagName.toLowerCase();
      const roleMap: Record<string, string> = {
        'button': 'button',
        'a': 'link',
        'input': inferInputRole(element),
        'select': 'combobox',
        'textarea': 'textbox',
        'img': 'img',
        'h1': 'heading',
        'h2': 'heading',
        'h3': 'heading',
        'h4': 'heading',
        'h5': 'heading',
        'h6': 'heading',
        'article': 'article',
        'nav': 'navigation',
        'form': 'form',
        'ul': 'list',
        'ol': 'list',
        'li': 'listitem',
        'table': 'table',
        'tr': 'row',
        'td': 'cell',
        'th': 'cell',
      };

      return roleMap[tag] || null;
    }

    /**
     * Infer input role based on type
     */
    function inferInputRole(input: BrowserElement): string {
      const type = input.type?.toLowerCase() || 'text';
      switch (type) {
        case 'button':
        case 'submit':
        case 'reset':
          return 'button';
        case 'checkbox':
          return 'checkbox';
        case 'radio':
          return 'radio';
        case 'email':
        case 'password':
        case 'search':
        case 'tel':
        case 'text':
        case 'url':
          return 'textbox';
        default:
          console.log(`Unknown input type: ${type}`);
          return 'unknown';
      }
    }

    /**
     * Get associated label text
     */
    function getLabel(element: Element): string | null {
      // aria-label
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        return ariaLabel.trim();
      }

      // aria-labelledby
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelElement = doc.getElementById(labelledBy);
        if (labelElement) {
          return normalizeText(labelElement);
        }
      }

      // label[for] association
      if (element.id) {
        const label = doc.querySelector(`label[for="${element.id}"]`);
        if (label) {
          return normalizeText(label);
        }
      }

      // Wrapping label
      const parentLabel = element.closest('label');
      if (parentLabel) {
        return normalizeText(parentLabel);
      }

      return null;
    }

    /**
     * Get all data-* attributes
     * 
     * @param element - Element to extract data attributes from
     * @returns Record of camelCase data attribute keys to their values
     */
    function getDataset(element: Element): Record<string, string> {
      const dataset: Record<string, string> = {};
      for (const attr of element.attributes) {
        if (attr.name.startsWith('data-')) {
          // Convert data-test-id to testId (camelCase)
          // Note: No type annotations in arrow function to avoid serialization issues in page.evaluate
          // @param {string} _match - Full match string (unused, but required by replace callback)
          // @param {string} letter - Captured letter group to uppercase
          // @ts-expect-error - Type annotations removed to prevent serialization issues in browser context
          const key = attr.name.replace(/^data-/, '').replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
          dataset[key] = attr.value;
        }
      }
      return dataset;
    }

    /**
     * Get nth-of-type index (1-based)
     */
    function getNthOfType(element: Element): number {
      const tag = element.tagName;
      let index = 1;
      let sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === tag) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }
      return index;
    }

    /**
     * Collect interactive elements
     */
    function collectInteractive() {

      const seen = new Set<Element>();

      const elements = doc.querySelectorAll(interactiveSelectors.join(','));
      for (const el of elements) {
        if (seen.has(el) || !isInteractive(el)) {
          continue;
        }
        seen.add(el);

        const text = getVisibleText(el);
        const target: TargetInfo = {
          tag: el.tagName.toLowerCase(),
          text,
          id: el.id || null,
          role: inferRole(el),
          label: getLabel(el),
          ariaLabel: el.getAttribute('aria-label') || null,
          typeAttr: (el as BrowserElement).type || null,
          nameAttr: el.getAttribute('name') || null,
          href: (el as BrowserHTMLAnchorElement).href || null,
          dataset: getDataset(el),
          nthOfType: getNthOfType(el),
        };

        targets.push(target);
      }
    }

    /**
     * Check if an element is a valid content candidate
     * (helper function to avoid duplication)
     */
    function isValidContentCandidate(element: Element): boolean {
      const tag = element.tagName.toLowerCase();
      
      // Skip structural elements
      if (['body', 'html', 'head', 'script', 'style', 'meta', 'link'].includes(tag)) {
        return false;
      }

      // Skip if interactive
      if (isInteractive(element)) {
        return false;
      }

      // Skip if has interactive children
      if (hasInteractiveChildren(element)) {
        return false;
      }

      // Skip if nested in interactive
      if (isNestedInInteractive(element)) {
        return false;
      }

      // Must have meaningful text
      const text = getVisibleText(element);
      return text.length > 0 && text.length < 500;
    }

    /**
     * Collect non-interactive content elements
     * (text-bearing elements that are not interactive and not nested)
     * Uses querySelectorAll('*') and filters out elements with interactive children
     * Returns the most parental node to avoid duplication
     */
    function collectContent() {
      // Query for all elements
      const allElements = doc.querySelectorAll('*');
      const candidates: Element[] = [];
      
      // First pass: collect all valid candidates
      for (const element of allElements) {
        if (isValidContentCandidate(element)) {
          candidates.push(element);
        }
      }

      // Second pass: filter to keep only the most parental nodes
      // Track which elements are excluded (because a parent was included)
      const excludedElements = new Set<Element>();
      
      // Process candidates from shallowest to deepest (parents before children)
      // This way, when we include a parent, we can mark its descendant candidates as excluded
      const candidatesByDepth = candidates.slice().sort((a, b) => {
        let depthA = 0;
        let depthB = 0;
        let parentA: Element | null = a.parentElement;
        let parentB: Element | null = b.parentElement;
        while (parentA && parentA !== doc.body) {
          depthA++;
          parentA = parentA.parentElement;
        }
        while (parentB && parentB !== doc.body) {
          depthB++;
          parentB = parentB.parentElement;
        }
        return depthA - depthB; // Shallower elements first (parents before children)
      });
      
      for (const element of candidatesByDepth) {
        // Skip if already excluded by a parent
        if (excludedElements.has(element)) {
          continue;
        }
        
        const elementText = getVisibleText(element);
        
        // Find all descendant candidates that aren't excluded
        const descendantCandidates: Element[] = [];
        const descendants = element.querySelectorAll('*');
        for (const descendant of descendants) {
          if (candidates.includes(descendant) && !excludedElements.has(descendant)) {
            descendantCandidates.push(descendant);
          }
        }

        // If no descendant candidates, this is a leaf node - include it
        if (descendantCandidates.length === 0) {
          const tag = element.tagName.toLowerCase();
          const target: TargetInfo = {
            tag,
            text: elementText,
            id: element.id || null,
            role: inferRole(element),
            label: getLabel(element),
            ariaLabel: element.getAttribute('aria-label') || null,
            typeAttr: null,
            nameAttr: element.getAttribute('name') || null,
            href: null,
            dataset: getDataset(element),
            nthOfType: getNthOfType(element),
          };
          targets.push(target);
          continue;
        }

        // If we have descendant candidates, check if this element adds value
        // Calculate the combined text from all descendant candidates
        const descendantTexts = descendantCandidates.map(desc => getVisibleText(desc));
        const combinedDescendantText = descendantTexts.join(' ').trim();
        
        // Normalize both texts for comparison (remove extra whitespace)
        const normalizedElementText = elementText.replace(/\s+/g, ' ').trim();
        const normalizedDescendantText = combinedDescendantText.replace(/\s+/g, ' ').trim();
        
        // If the element's text is exactly the same as the combined descendant text,
        // skip this element (descendants represent the content)
        // Otherwise, keep it (it has additional content beyond descendants)
        if (normalizedElementText !== normalizedDescendantText) {
          // Include this parent element and exclude all its descendant candidates
          const tag = element.tagName.toLowerCase();
          const target: TargetInfo = {
            tag,
            text: elementText,
            id: element.id || null,
            role: inferRole(element),
            label: getLabel(element),
            ariaLabel: element.getAttribute('aria-label') || null,
            typeAttr: null,
            nameAttr: element.getAttribute('name') || null,
            href: null,
            dataset: getDataset(element),
            nthOfType: getNthOfType(element),
          };
          targets.push(target);
          
          // Mark all descendant candidates as excluded (parent contains them)
          for (const descendant of descendantCandidates) {
            excludedElements.add(descendant);
          }
        }
        // If text matches, we skip this element and will get the descendants instead
      }
    }

    // Collect interactive elements (always collected)
    collectInteractive();
    
    // Collect content elements only if interactableOnly is false
    if (!interactableOnlyFlag) {
      // console.log('Collecting content elements ------------------------------');
      collectContent();
    }

    // Deduplicate by element identity (if same id/text/role combo)
    const unique = new Map<string, TargetInfo>();
    for (const target of targets) {
      const key = `${target.tag}:${target.id || ''}:${target.text.substring(0, 50)}:${target.role || ''}`;
      if (!unique.has(key)) {
        unique.set(key, target);
      }
    }

    return Array.from(unique.values());
  }, interactableOnly);
}

/**
 * Escape special characters in CSS selector attribute values
 * 
 * @param value - The attribute value to escape
 * @returns Escaped value safe for use in CSS selectors
 */
function escapeSelectorValue(value: string): string {
  // Escape quotes and backslashes for CSS attribute selectors
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build the best Playwright selector for a given target element
 * 
 * Selectors are prioritized by stability:
 * 1. ID selector (most stable)
 * 2. Role + aria-label or label
 * 3. Data attributes (data-testid, data-id, etc.)
 * 4. Name attribute (for form elements)
 * 5. Role + text content
 * 6. Tag + nth-of-type (least stable, fallback)
 * 
 * @param target - TargetInfo object containing element metadata
 * @returns Playwright selector string optimized for stability and reliability
 */
/**
 * Score how well an element matches the target information
 * Higher score = better match
 * 
 * @param elementIndex - Index of the element in the locator's matches
 * @param locator - Playwright Locator that matches multiple elements
 * @param target - TargetInfo to match against
 * @returns Score indicating match quality (0-100)
 */
async function scoreElementMatch(
  elementIndex: number,
  locator: any,
  target: TargetInfo
): Promise<number> {
  // Get element properties by evaluating on the specific element
  // Note: Inside evaluate(), we're in the browser context where DOM APIs are available
  const elementInfo = await locator.nth(elementIndex).evaluate((el: any) => {
    const getVisibleText = (element: any): string => {
      // @ts-ignore - window is available in browser context
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return '';
      }
      return (element.textContent || '').trim().replace(/\s+/g, ' ');
    };

    const getLabel = (element: any): string | null => {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();
      
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        // @ts-ignore - document is available in browser context
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return (labelEl.textContent || '').trim();
      }
      
      if (element.id) {
        // @ts-ignore - document is available in browser context
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) return (label.textContent || '').trim();
      }
      
      const parentLabel = element.closest('label');
      if (parentLabel) return (parentLabel.textContent || '').trim();
      
      return null;
    };

    const dataset: Record<string, string> = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-')) {
        // Convert data-test-id to testId (camelCase)
        // Note: No type annotations in arrow function to avoid serialization issues in locator.evaluate
        // @param {string} _match - Full match string (unused, but required by replace callback)
        // @param {string} letter - Captured letter group to uppercase
        // @ts-expect-error - Type annotations removed to prevent serialization issues in browser context
        const key = attr.name.replace(/^data-/, '').replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
        dataset[key] = attr.value;
      }
    }

    return {
      tag: el.tagName.toLowerCase(),
      text: getVisibleText(el),
      id: el.id || null,
      role: el.getAttribute('role') || null,
      label: getLabel(el),
      ariaLabel: el.getAttribute('aria-label') || null,
      typeAttr: el.type || null,
      nameAttr: el.getAttribute('name') || null,
      dataset,
    };
  });

  if (!elementInfo) return 0;

  let score = 0;

  // Tag match (10 points)
  if (elementInfo.tag === target.tag) {
    score += 10;
  }

  // ID match (30 points - very specific)
  if (target.id && elementInfo.id === target.id) {
    score += 30;
  }

  // Role match (15 points)
  if (target.role && elementInfo.role === target.role) {
    score += 15;
  }

  // Text match (20 points)
  if (target.text && elementInfo.text) {
    const targetText = target.text.trim().toLowerCase();
    const elementText = elementInfo.text.trim().toLowerCase();
    if (targetText === elementText) {
      score += 20; // Exact match
    } else if (elementText.includes(targetText) || targetText.includes(elementText)) {
      score += 10; // Partial match
    }
  }

  // Aria-label match (15 points)
  if (target.ariaLabel && elementInfo.ariaLabel) {
    if (target.ariaLabel.trim().toLowerCase() === elementInfo.ariaLabel.trim().toLowerCase()) {
      score += 15;
    }
  }

  // Label match (15 points)
  if (target.label && elementInfo.label) {
    if (target.label.trim().toLowerCase() === elementInfo.label.trim().toLowerCase()) {
      score += 15;
    }
  }

  // Type attribute match (10 points)
  if (target.typeAttr && elementInfo.typeAttr === target.typeAttr) {
    score += 10;
  }

  // Name attribute match (15 points)
  if (target.nameAttr && elementInfo.nameAttr === target.nameAttr) {
    score += 15;
  }

  // Dataset match (10 points for testid, 5 for others)
  if (target.dataset && elementInfo.dataset) {
    if (target.dataset.testid && elementInfo.dataset.testid === target.dataset.testid) {
      score += 10;
    }
    // Check other dataset keys
    for (const key in target.dataset) {
      if (target.dataset[key] && elementInfo.dataset[key] === target.dataset[key]) {
        score += 5;
      }
    }
  }

  return score;
}

/**
 * Build the best Playwright locator for a given target element
 * 
 * Follows Playwright's recommended selector priority:
 * 1. data-testid (use page.getByTestId()) - #1 recommendation, most stable
 * 2. Role-based (use page.getByRole()) - #2 recommendation, accessibility-based
 * 3. Text-based (use page.getByText()) - #3 recommendation, good for visible text
 * 4. CSS selectors as fallback (ID, data attributes, name, tag selectors)
 * 
 * If a locator matches multiple elements, this function will evaluate each
 * and return the one that best matches the target information.
 * 
 * @param page - Playwright Page object
 * @param target - TargetInfo object containing element metadata
 * @returns Playwright Locator for the target element, prioritized by Playwright's best practices
 */
export async function buildSelectorForTarget(page: Page, target?: TargetInfo): Promise<Locator | null> {
  if (!target) {
    return null;
  }
  /**
   * Helper function to check if locator matches multiple elements and pick the best one
   */
  const resolveBestLocator = async (locator: any): Promise<any> => {
    let count: number;
    try {
      count = await locator.count();
    } catch (error) {
      // If page is closed, throw a more descriptive error
      if (error instanceof Error && error.message.includes('closed')) {
        throw new Error('Cannot resolve locator: page, context or browser has been closed. This may happen if a previous action closed the page unexpectedly.');
      }
      throw error;
    }
    
    // If only one match, return it directly
    if (count <= 1) {
      return locator;
    }

    // If multiple matches, score each one and pick the best
    const scores: Array<{ index: number; score: number }> = [];
    
    for (let i = 0; i < count; i++) {
      const score = await scoreElementMatch(i, locator, target);
      scores.push({ index: i, score });
    }

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    // Return the best matching element using .nth()
    // We know scores has at least one element since count > 1
    const bestMatch = scores[0];
    if (!bestMatch) {
      // Fallback to first element if somehow scores is empty
      return locator.first();
    }
    return locator.nth(bestMatch.index);
  };

  // Priority 1: data-testid (Playwright's #1 recommendation)
  // Use page.getByTestId() - most stable and recommended
  if (target.dataset && target.dataset.testid) {
    const locator = page.getByTestId(target.dataset.testid);
    return await resolveBestLocator(locator);
  }

  // Priority 2: Role-based selector (Playwright's #2 recommendation)
  // Use page.getByRole() - accessibility-based, very stable
  if (target.role) {
    let locator: any;
    // If we have aria-label, use it as the name parameter for getByRole
    if (target.ariaLabel) {
      locator = page.getByRole(target.role as any, { name: target.ariaLabel });
    }
    // If we have a label, use it as the name parameter
    else if (target.label) {
      locator = page.getByRole(target.role as any, { name: target.label });
    }
    // If we have text content, use it as the name parameter
    else if (target.text && target.text.trim().length > 0) {
      locator = page.getByRole(target.role as any, { name: target.text.trim() });
    }
    // Just role without name
    else {
      locator = page.getByRole(target.role as any);
    }
    return await resolveBestLocator(locator);
  }

  // Priority 3: Text-based selector (Playwright's #3 recommendation)
  // Use page.getByText() - good for elements with visible text
  if (target.text && target.text.trim().length > 0) {
    const trimmedText = target.text.trim();
    // For short, specific text, use exact match
    // For longer text, use partial match
    const useExact = trimmedText.length < 50 && !trimmedText.includes('\n');
    const locator = page.getByText(trimmedText, { exact: useExact });
    return await resolveBestLocator(locator);
  }

  // Priority 4: ID selector (CSS fallback)
  // Still stable but not Playwright's preferred method
  if (target.id) {
    const locator = page.locator(`#${target.id}`);
    return await resolveBestLocator(locator);
  }

  // Priority 5: Other data attributes (CSS fallback)
  if (target.dataset && Object.keys(target.dataset).length > 0) {
    let locator: any;
    // Prefer data-id if available
    if (target.dataset.id) {
      const escapedValue = escapeSelectorValue(target.dataset.id);
      locator = page.locator(`[data-id="${escapedValue}"]`);
    } else {
      // Use first data attribute as fallback
      const dataKeys = Object.keys(target.dataset);
      if (dataKeys.length > 0) {
        const firstKey = dataKeys[0];
        if (firstKey) {
          // Convert camelCase to kebab-case: testId -> test-id
          const dataKey = firstKey
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase();
          const value = target.dataset[firstKey];
          if (value) {
            const escapedValue = escapeSelectorValue(value);
            locator = page.locator(`[data-${dataKey}="${escapedValue}"]`);
          }
        }
      }
    }
    if (locator) {
      return await resolveBestLocator(locator);
    }
  }

  // Priority 6: Name attribute (CSS fallback, useful for form elements)
  if (target.nameAttr) {
    const escapedName = escapeSelectorValue(target.nameAttr);
    const locator = page.locator(`[name="${escapedName}"]`);
    return await resolveBestLocator(locator);
  }

  // Priority 7: Tag + type attribute (CSS fallback, for inputs)
  if (target.tag === 'input' && target.typeAttr) {
    const locator = page.locator(`input[type="${target.typeAttr}"]`);
    return await resolveBestLocator(locator);
  }

  // Priority 8: Tag + nth-of-type (CSS fallback, least stable)
  // This is the most fragile selector but ensures we can always find something
  // No need to check for multiple matches here since nth-of-type is already specific
  return page.locator(`${target.tag}:nth-of-type(${target.nthOfType})`);
}

/**
 * Generate the best Playwright selector for a given element
 * 
 * Analyzes an element and its parent hierarchy to find the best selector
 * following Playwright's recommended practices. Verifies uniqueness at each step.
 * 
 * Priority order:
 * 1. data-testid → getByTestId()
 * 2. role + name (aria-label/label) → getByRole()
 * 3. label → getByLabel()
 * 4. placeholder → getByPlaceholder()
 * 5. alt → getByAltText()
 * 6. title → getByTitle()
 * 7. text → getByText()
 * 8. CSS fallback (ID, name, tag + nth-of-type)
 * 
 * @param locator - Playwright Locator pointing to the target element
 * @param options - Optional configuration
 * @param options.timeout - Timeout in milliseconds for element operations (default: 300000 = 5 minutes)
 * @returns Promise resolving to SelectorDescriptor that uniquely identifies the element
 */
export async function generateBestSelectorForElement(
  locator: Locator,
  options?: { timeout?: number }
): Promise<SelectorDescriptor> {
  const page = locator.page();
  // Default to 5 minutes (300000ms) for slow tests, especially when generating selectors
  // This helps avoid timeouts during element analysis which can be slow
  const timeout = options?.timeout ?? 300000;
  
  // Get mimic ID from the locator using the markers system
  // This replaces the old targetElementHandle approach for verification
  const targetMimicId = await getMimicIdFromLocator(locator);
  
  // If no mimic ID found, we can't verify uniqueness with markers
  // This could happen if markers haven't been installed yet
  // We'll still try to generate a selector, but verification will be less strict
  
  // Get element handle from locator for page.evaluate() calls
  // We still need this for browser context evaluation
  // Use extended timeout for slow tests
  const targetElementHandle = await locator.elementHandle({ timeout });
  
  if (!targetElementHandle) {
    throw new Error('Cannot get element handle from locator');
  }
  
  // Get element information in browser context
  let elementInfo;
  try {
    elementInfo = await page.evaluate((element) => {
      // @ts-ignore - window is available in browser context
      const win = window;
      // @ts-ignore - document is available in browser context
      const doc = document;
      
      // Inline all logic to avoid nested functions that get transformed by toolchain
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
      const dataset = {};
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
          (dataset as any)[result] = attr.value;
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
    }, targetElementHandle);
  } catch (error: any) {
    // Enhanced error reporting to help identify the exact location of the issue
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || '';
    
    // Check if this is the __name error
    if (errorMessage.includes('__name') || errorStack.includes('__name')) {
      console.error('Error in generateBestSelectorForElement - page.evaluate failed');
      console.error('Error message:', errorMessage);
      console.error('Error stack:', errorStack);
      console.error('This error typically occurs when TypeScript type annotations are used in arrow functions within page.evaluate');
      console.error('Please check for any remaining type annotations in the evaluate function');
    }
    
    throw new Error(
      `Failed to evaluate element in browser context: ${errorMessage}. ` +
      `This may be caused by TypeScript type annotations in the evaluate function. ` +
      `Original error: ${errorStack}`
    );
  }
  
  // Find the best parent/ancestor selector by checking multiple levels and selector types
  // This handles cases where the locator was created from a parent chain
  // Returns the best parent selector found, or null if none found
  const findBestParentSelector = async (): Promise<SelectorDescriptor | null> => {
    const parentCandidates = await page.evaluate((element) => {
      const candidates = [];
      let current = element.parentElement;
      let depth = 0;
      const maxDepth = 10; // Limit depth to avoid going too far up
      
      while (current && current.tagName !== 'BODY' && current.tagName !== 'HTML' && depth < maxDepth) {
        // Get all relevant information about this ancestor
        const testId = current.getAttribute('data-testid');
        const role = current.getAttribute('role');
        const id = current.id;
        const ariaLabel = current.getAttribute('aria-label');
        const label = current.getAttribute('aria-labelledby');
        
        // Get visible text for role/text matching
        const style = window.getComputedStyle(current);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        const text = isVisible ? (current.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 100) : '';
        
        // Infer role if not explicitly set
        let inferredRole = role;
        if (!inferredRole) {
          const tag = current.tagName.toLowerCase();
          if (tag === 'section' || tag === 'article' || tag === 'aside' || tag === 'nav' || tag === 'main' || tag === 'header' || tag === 'footer') {
            inferredRole = tag;
          } else if (tag === 'form') {
            inferredRole = 'form';
          }
        }
        
        // Get dataset
        const dataset = {};
        for (let i = 0; i < current.attributes.length; i++) {
          const attr = current.attributes[i];
          if (attr && attr.name && attr.name.startsWith('data-')) {
            let key = attr.name.replace(/^data-/, '');
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
            (dataset as any)[result] = attr.value;
          }
        }
        
        candidates.push({
          depth,
          testId,
          role: inferredRole,
          id,
          ariaLabel,
          label,
          text,
          dataset,
          tag: current.tagName.toLowerCase(),
        });
        
        current = current.parentElement;
        depth++;
      }
      
      return candidates;
    }, targetElementHandle);
    
    // Try to find the best parent selector, prioritizing:
    // 1. testid
    // 2. role with name/text
    // 3. role alone (if unique enough)
    // 4. label
    // 5. id (as CSS, but better than nth-of-type)
    
    for (const candidate of parentCandidates) {
      // Priority 1: testid
      const dataset = candidate.dataset as Record<string, string>;
      if (dataset && dataset.testid) {
        const parentDescriptor: TestIdSelector = {
          type: 'testid',
          value: dataset.testid,
        };
        // Check if this parent selector is unique enough
        const parentLocator = page.getByTestId(dataset.testid);
        const count = await parentLocator.count();
        if (count === 1) {
          return parentDescriptor;
        }
        // Even if not unique, it might work with a child selector
        return parentDescriptor;
      }
      
      // Priority 2: role with name/text
      if (candidate.role) {
        const name = candidate.ariaLabel || candidate.text;
        if (name && name.trim() && name.length < 100) {
          const parentDescriptor: RoleSelector = {
            type: 'role',
            role: candidate.role as AriaRole,
            name: name.trim(),
            exact: false,
          };
          const parentLocator = page.getByRole(candidate.role as AriaRole, { name: name.trim() });
          const count = await parentLocator.count();
          if (count === 1) {
            return parentDescriptor;
          }
          // Try with exact match
          const parentDescriptorExact: RoleSelector = {
            type: 'role',
            role: candidate.role as AriaRole,
            name: name.trim(),
            exact: true,
          };
          const parentLocatorExact = page.getByRole(candidate.role as AriaRole, { name: name.trim(), exact: true });
          const countExact = await parentLocatorExact.count();
          if (countExact === 1) {
            return parentDescriptorExact;
          }
          // Even if not unique, it might work with a child selector
          return parentDescriptor;
        }
        
        // Role without name - check if unique
        const parentDescriptor: RoleSelector = {
          type: 'role',
          role: candidate.role as AriaRole,
        };
        const parentLocator = page.getByRole(candidate.role as AriaRole);
        const count = await parentLocator.count();
        // If unique, return it
        if (count === 1) {
          return parentDescriptor;
        }
        // Even if not unique, it might work with a child selector
        return parentDescriptor;
      }
      
      // Priority 3: label (for form elements)
      if (candidate.label) {
        const parentDescriptor: LabelSelector = {
          type: 'label',
          value: candidate.label,
          exact: false,
        };
        const parentLocator = page.getByLabel(candidate.label);
        const count = await parentLocator.count();
        if (count === 1) {
          return parentDescriptor;
        }
        return parentDescriptor;
      }
      
      // Priority 4: id (better than CSS nth-of-type, but still CSS)
      if (candidate.id) {
        const parentDescriptor: CssSelector = {
          type: 'css',
          selector: `#${candidate.id}`,
        };
        const parentLocator = page.locator(`#${candidate.id}`);
        const count = await parentLocator.count();
        if (count === 1) {
          return parentDescriptor;
        }
      }
    }
    
    return null;
  };
  
  const bestParentSelector = await findBestParentSelector();

  // Try to find selector on element itself first
  const tryElementSelector = async (): Promise<SelectorDescriptor | null> => {
    // Priority 1: data-testid
    const dataset = elementInfo.dataset as Record<string, string>;
    if (dataset && dataset.testid) {
      const descriptor: TestIdSelector = {
        type: 'testid',
        value: dataset.testid,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId ?? null, timeout);
      if (verification.unique) {
        return descriptor;
      }
    }
    
    // Priority 2: role + name
    if (elementInfo.role) {
      const name = elementInfo.ariaLabel || elementInfo.label || elementInfo.text;
      if (name && name.trim()) {
        // Try exact match first
        const descriptorExact: RoleSelector = {
          type: 'role',
          role: elementInfo.role as AriaRole,
          name: name.trim(),
          exact: true,
        };
        const verificationExact = await verifySelectorUniqueness(page, descriptorExact, targetMimicId ?? null);
        if (verificationExact.unique) {
          return descriptorExact;
        }
        
        // Try non-exact match
        const descriptor: RoleSelector = {
          type: 'role',
          role: elementInfo.role as AriaRole,
          name: name.trim(),
          exact: false,
        };
        const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId ?? null, timeout);
        if (verification.unique) {
          return descriptor;
        }
      }
      
      // Role without name
      const descriptor: RoleSelector = {
        type: 'role',
        role: elementInfo.role as AriaRole,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId ?? null, timeout);
      if (verification.unique) {
        return descriptor;
      }
    }
    
    // Priority 3: label
    if (elementInfo.label) {
      const descriptorExact: LabelSelector = {
        type: 'label',
        value: elementInfo.label.trim(),
        exact: true,
      };
      const verificationExact = await verifySelectorUniqueness(page, descriptorExact, targetMimicId ?? null);
      if (verificationExact.unique) {
        return descriptorExact;
      }
      
      const descriptor: LabelSelector = {
        type: 'label',
        value: elementInfo.label.trim(),
        exact: false,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId ?? null, timeout);
      if (verification.unique) {
        return descriptor;
      }
    }
    
    // Priority 4: placeholder
    if (elementInfo.placeholder) {
      const descriptor: PlaceholderSelector = {
        type: 'placeholder',
        value: elementInfo.placeholder.trim(),
        exact: false,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId ?? null, timeout);
      if (verification.unique) {
        return descriptor;
      }
    }
    
    // Priority 5: alt
    if (elementInfo.alt) {
      const descriptor: AltTextSelector = {
        type: 'alt',
        value: elementInfo.alt.trim(),
        exact: false,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId ?? null, timeout);
      if (verification.unique) {
        return descriptor;
      }
    }
    
    // Priority 6: title
    if (elementInfo.title) {
      const descriptor: TitleSelector = {
        type: 'title',
        value: elementInfo.title.trim(),
        exact: false,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId ?? null, timeout);
      if (verification.unique) {
        return descriptor;
      }
    }
    
    // Priority 7: text
    if (elementInfo.text && elementInfo.text.trim()) {
      const trimmedText = elementInfo.text.trim();
      // For short text, try exact match
      if (trimmedText.length < 50) {
        const descriptorExact: TextSelector = {
          type: 'text',
          value: trimmedText,
          exact: true,
        };
        const verificationExact = await verifySelectorUniqueness(page, descriptorExact, targetMimicId ?? null);
        if (verificationExact.unique) {
          return descriptorExact;
        }
      }
      
      const descriptor: TextSelector = {
        type: 'text',
        value: trimmedText,
        exact: false,
      };
      const verification = await verifySelectorUniqueness(page, descriptor, targetMimicId ?? null, timeout);
      if (verification.unique) {
        return descriptor;
      }
    }
    
    // Don't use CSS here - only as absolute last resort after trying parent selectors
    // CSS selectors are less stable and harder to maintain
    return null;
  };
  
  // If we found a good parent selector, prioritize creating a nested selector
  // This handles cases where the locator was created from a parent chain like:
  // page.getByTestId('parent').getByRole('button', { name: 'Add to Cart' })
  // or page.getByRole('section').getByRole('button', { name: 'Add to Cart' })
  if (bestParentSelector) {
    const childSelector = await tryElementSelector();
    
    // Create nested selector with parent and child
    const createNestedSelector = (parent: SelectorDescriptor, child: SelectorDescriptor): SelectorDescriptor => {
      // Clone parent and add child
      const nested = { ...parent };
      (nested as any).child = child;
      return nested as SelectorDescriptor;
    };
    
    // Always create nested selector if we have a parent and child selector
    // The combination should be unique even if child alone isn't
    if (childSelector) {
      const nestedDescriptor = createNestedSelector(bestParentSelector, childSelector);
      // Verify the nested selector is unique
      const verification = await verifySelectorUniqueness(page, nestedDescriptor, targetMimicId ?? null);
      if (verification.unique) {
        return nestedDescriptor;
      }
    }
    
    // Even if child selector generation failed, try with a basic role/text selector
    // This handles cases where the element has a role but tryElementSelector didn't find it unique
    if (elementInfo.role) {
      const name = elementInfo.ariaLabel || elementInfo.label || elementInfo.text;
      if (name && name.trim()) {
        const childSelector: RoleSelector = {
          type: 'role',
          role: elementInfo.role as AriaRole,
          name: name.trim(),
          exact: false,
        };
        const nestedDescriptor = createNestedSelector(bestParentSelector, childSelector);
        const verification = await verifySelectorUniqueness(page, nestedDescriptor, targetMimicId ?? null);
        if (verification.unique) {
          return nestedDescriptor;
        }
      }
      // Try role without name
      const childSelector: RoleSelector = {
        type: 'role',
        role: elementInfo.role as AriaRole,
      };
      const nestedDescriptor = createNestedSelector(bestParentSelector, childSelector);
      const verification = await verifySelectorUniqueness(page, nestedDescriptor, targetMimicId ?? null);
      if (verification.unique) {
        return nestedDescriptor;
      }
    }
    
    // Try with text selector if available
    if (elementInfo.text && elementInfo.text.trim() && elementInfo.text.length < 50) {
      const childSelector: TextSelector = {
        type: 'text',
        value: elementInfo.text.trim(),
        exact: false,
      };
      const nestedDescriptor = createNestedSelector(bestParentSelector, childSelector);
      const verification = await verifySelectorUniqueness(page, nestedDescriptor, targetMimicId ?? null);
      if (verification.unique) {
        return nestedDescriptor;
      }
    }
  }
  
  // Try element itself first (if no good parent found)
  if (!bestParentSelector) {
    const elementSelector = await tryElementSelector();
    if (elementSelector) {
      return elementSelector;
    }
  }
  
  // Final fallback: CSS selector (only if nothing else works)
  // This is the absolute last resort - prefer nested selectors over CSS
  const fallback: CssSelector = {
    type: 'css',
    selector: `${elementInfo.tag}:nth-of-type(${elementInfo.nthOfType})`,
  };
  
  return fallback;
}

