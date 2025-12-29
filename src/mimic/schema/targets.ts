import type { Page } from '@playwright/test';

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

/** TODO: get types */
type Element = any;

/**
 * Element Scanner
 * 
 * Runs in the browser context (via page.evaluate) to collect all
 * "interesting" elements: interactive or text-bearing, non-nested content.
 * 
 * Uses Playwright best practices for element discovery.
 */
export async function captureTargets(page: Page): Promise<TargetInfo[]> {
  return await page.evaluate(() => {
    const targets: TargetInfo[] = [];

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
      const style = window.getComputedStyle(element);
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
      const interactiveTags = ['button', 'a', 'input', 'select', 'textarea', 'details', 'summary'];
      
      if (interactiveTags.includes(tag)) {
        return true;
      }

      // Check for interactive ARIA roles
      const role = element.getAttribute('role');
      const interactiveRoles = [
        'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
        'menuitem', 'tab', 'option', 'switch'
      ];
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
                        (element as HTMLElement).onclick !== null;
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
      while (parent && parent !== document.body) {
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
    function inferRole(element: Element): string | null {
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
        'input': inferInputRole(element as HTMLInputElement),
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
    function inferInputRole(input: HTMLInputElement): string {
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
        default:
          return 'textbox';
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
        const labelElement = document.getElementById(labelledBy);
        if (labelElement) {
          return normalizeText(labelElement);
        }
      }

      // label[for] association
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
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
          const key = attr.name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
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
    async function collectInteractive() {
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

      const seen = new Set<Element>();

      for (const selector of interactiveSelectors) {
        const elements = await page.locator(selector).all();
        for (const el of elements) {
          if (seen.has(el) || !isInteractive(el)) {
            continue;
          }
          seen.add(el);
          

          // const text = getVisibleText(el);
          const target: TargetInfo = {
            tag: el.tagName.toLowerCase(),
            text: el.textContent || '',
            id: el.id || null,
            role: inferRole(el),
            label: getLabel(el),
            ariaLabel: el.getAttribute('aria-label') || null,
            typeAttr: (el as Element).type || null,
            nameAttr: el.getAttribute('name') || null,
            href: (el as HTMLAnchorElement).href || null,
            dataset: getDataset(el),
            nthOfType: getNthOfType(el),
          };

          targets.push(target);
        }
      }
    }

    /**
     * Collect non-interactive content elements
     * (text-bearing elements that are not interactive and not nested)
     */
    function collectContent() {
      // Walk the DOM tree
      function walk(node: Node) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }

        const element = node as Element;

        // Skip if it's body, header, or other structural elements we don't want
        const tag = element.tagName.toLowerCase();
        if (['body', 'html', 'head', 'script', 'style', 'meta', 'link'].includes(tag)) {
          return;
        }

        // Skip if interactive
        if (isInteractive(element)) {
          return;
        }

        // Skip if has interactive children
        if (hasInteractiveChildren(element)) {
          // Still walk children, but don't include this element
          for (const child of Array.from(element.childNodes)) {
            walk(child);
          }
          return;
        }

        // Skip if nested in interactive
        if (isNestedInInteractive(element)) {
          return;
        }

        // Check if element has meaningful text
        const text = getVisibleText(element);
        if (text.length > 0 && text.length < 500) { // Reasonable text length
          const target: TargetInfo = {
            tag,
            text,
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
        }

        // Walk children
        for (const child of Array.from(element.childNodes)) {
          walk(child);
        }
      }

      walk(document.body);
    }

    // Collect both interactive and content elements
    collectInteractive();
    collectContent();

    // Deduplicate by element identity (if same id/text/role combo)
    const unique = new Map<string, TargetInfo>();
    for (const target of targets) {
      const key = `${target.tag}:${target.id || ''}:${target.text.substring(0, 50)}:${target.role || ''}`;
      if (!unique.has(key)) {
        unique.set(key, target);
      }
    }

    return Array.from(unique.values());
  });
}

