import { Page } from '@playwright/test';

/**
 * Browser context types (used in page.evaluate)
 * These types represent the browser DOM APIs available in page.evaluate()
 */
type BrowserElement = any;
type BrowserNode = any;
type BrowserHTMLElement = any;
type BrowserBrowserElement = any;
type BrowserHTMLButtonElement = any;
type BrowserHTMLAnchorElement = any;
type BrowserHTMLImageElement = any;
type BrowserHTMLSelectElement = any;

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

      for (const selector of interactiveSelectors) {
        const elements = doc.querySelectorAll(selector);
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


