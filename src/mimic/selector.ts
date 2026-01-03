import { Locator, Page } from '@playwright/test';

/**
 * Browser context types (used in page.evaluate)
 * These types represent the browser DOM APIs available in page.evaluate()
 */
type BrowserElement = any;
type BrowserHTMLAnchorElement = any;

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
     */
    function getDataset(element: Element): Record<string, string> {
      const dataset: Record<string, string> = {};
      for (const attr of element.attributes) {
        if (attr.name.startsWith('data-')) {
          const key = attr.name.replace(/^data-/, '').replace(/-([a-z])/g, (_: string, letter: string) => letter.toUpperCase());
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
        const key = attr.name.replace(/^data-/, '').replace(/-([a-z])/g, (_: string, letter: string) => letter.toUpperCase());
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

