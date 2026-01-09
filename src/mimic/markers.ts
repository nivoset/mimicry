/**
 * Marker Code Module
 * 
 * Provides functionality to add visual markers/badges to page elements
 * for debugging and element identification purposes.
 */

import type { Page } from '@playwright/test';

/**
 * Marker information returned from the browser
 */
export interface MarkerInfo {
  /** The mimic ID assigned to the element */
  mimicId: number;
  /** Element type: 'interactive', 'display', or 'structure' */
  type: 'interactive' | 'display' | 'structure';
  /** Element tag name */
  tag: string;
  /** Bounding rectangle for rendering markers locally */
  rect: { x: number; y: number; width: number; height: number };
  /** Element text content (truncated) */
  text: string;
  /** Element ID attribute */
  id: string | null;
  /** ARIA role */
  role: string | null;
  /** aria-label attribute */
  ariaLabel: string | null;
}

/**
 * Marker code to be injected into the page
 * 
 * This code assigns data-mimic-id attributes to elements and returns
 * information about all marked elements. No CSS or visual changes are made.
 * 
 * The code categorizes elements as:
 * - Interactive elements (buttons, links, inputs, etc.)
 * - Display-only content elements (text, images, etc.)
 * - Structure/test anchor elements (main, section, data-testid, etc.)
 */
const MARKER_CODE = `
  (() => {
    const INTERACTIVE_SELECTOR = \`
      a[href],
      button,
      input,
      select,
      textarea,
      summary,
      details,
      [role="button"],
      [role="link"],
      [role="checkbox"],
      [role="menuitem"],
      [role="option"],
      [tabindex]:not([tabindex="-1"])
    \`;
  
    const STRUCTURE_SELECTOR = \`
      [data-testid],
      main,
      section,
      article,
      nav,
      aside,
      header,
      footer
    \`;
  
    const ALLOWED_INLINE_TAGS = new Set([
      "B","I","STRONG","EM","U","S","SPAN","SMALL",
      "MARK","CODE","KBD","SAMP","SUP","SUB","BR","WBR"
    ]);
  
    function isVisible(el) {
      if (!(el instanceof Element)) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
  
    function isDisplayOnlyElement(el) {
      if (!(el instanceof Element)) return false;
      if (el.matches(INTERACTIVE_SELECTOR)) return false;
      if (el.querySelector(INTERACTIVE_SELECTOR)) return false;
  
      for (let i = 0; i < el.childNodes.length; i++) {
        const node = el.childNodes[i];
  
        if (node.nodeType === Node.TEXT_NODE) {
          continue;
        }
  
        if (node.nodeType === Node.ELEMENT_NODE) {
          const childEl = node;
          if (!ALLOWED_INLINE_TAGS.has(childEl.tagName)) return false;
          if (!isDisplayOnlyElement(childEl)) return false;
          continue;
        }
  
        return false;
      }
  
      return true;
    }
  
    // Initialize or reuse existing ID counter
    if (!window.__mimicNextId) {
      window.__mimicNextId = 1;
    }
  
    function getOrAssignStableId(el, type) {
      const existing = el.getAttribute("data-mimic-id");
      if (existing) {
        // If element already has an ID, ensure type is set
        if (!el.getAttribute("data-mimic-type")) {
          el.setAttribute("data-mimic-type", type);
        }
        return Number(existing);
      }
  
      const id = window.__mimicNextId++;
      el.setAttribute("data-mimic-id", String(id));
      el.setAttribute("data-mimic-type", type);
      return id;
    }
  
    const markers = [];
    const all = document.querySelectorAll("*");
  
    // Pass 1: Interactive elements
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (!isVisible(el)) continue;
      if (el.matches(INTERACTIVE_SELECTOR)) {
        const id = getOrAssignStableId(el, 'interactive');
        const rect = el.getBoundingClientRect();
        markers.push({
          mimicId: id,
          type: 'interactive',
          tag: el.tagName.toLowerCase(),
          rect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          },
          text: (el.textContent || '').trim().substring(0, 100),
          id: el.id || null,
          role: el.getAttribute('role') || null,
          ariaLabel: el.getAttribute('aria-label') || null
        });
      }
    }
  
    // Pass 2: Display-only content elements
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (!isVisible(el)) continue;
      // Skip if already marked as interactive
      if (el.getAttribute("data-mimic-id")) continue;
      if (isDisplayOnlyElement(el)) {
        const id = getOrAssignStableId(el, 'display');
        const rect = el.getBoundingClientRect();
        markers.push({
          mimicId: id,
          type: 'display',
          tag: el.tagName.toLowerCase(),
          rect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          },
          text: (el.textContent || '').trim().substring(0, 100),
          id: el.id || null,
          role: el.getAttribute('role') || null,
          ariaLabel: el.getAttribute('aria-label') || null
        });
      }
    }
  
    // Pass 3: Structure / test anchor elements
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (!isVisible(el)) continue;
      // Skip if already marked
      if (el.getAttribute("data-mimic-id")) continue;
      if (el.matches(STRUCTURE_SELECTOR)) {
        const id = getOrAssignStableId(el, 'structure');
        const rect = el.getBoundingClientRect();
        markers.push({
          mimicId: id,
          type: 'structure',
          tag: el.tagName.toLowerCase(),
          rect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          },
          text: (el.textContent || '').trim().substring(0, 100),
          id: el.id || null,
          role: el.getAttribute('role') || null,
          ariaLabel: el.getAttribute('aria-label') || null
        });
      }
    }
  
    return markers;
  })();
`;

/**
 * Add marker code to the page and return marker information
 * 
 * Assigns data-mimic-id attributes to elements and returns information
 * about all marked elements. No CSS or visual changes are made in the browser.
 * 
 * @param page - Playwright Page object to inject the marker code into
 * @returns Promise that resolves to an array of marker information
 */
export async function addMarkerCode(page: Page): Promise<MarkerInfo[]> {
  const markers = await page.evaluate(MARKER_CODE) as MarkerInfo[];
  return markers;
}

/**
 * Get a locator for an element by its mimic ID
 * 
 * Returns a Playwright locator for the element with the specified mimic ID.
 * The mimic ID is assigned by the marker system and provides a stable way
 * to identify elements across page reloads and DOM changes.
 * 
 * @param page - Playwright Page object
 * @param id - The mimic ID number assigned to the element
 * @returns Locator for the element with the specified mimic ID
 * 
 * @example
 * ```typescript
 * await addMarkerCode(page);
 * const button = getMimic(page, 28);
 * await button.click();
 * ```
 */
export function getMimic(page: Page, id: number) {
  return page.locator(`[data-mimic-id="${id}"]`);
}

/**
 * Element metadata captured using the markers system
 * 
 * This replaces TargetInfo and uses marker IDs for element identification.
 */
export interface MarkerElementInfo {
  /** The mimic ID assigned to the element by the markers system */
  mimicId: number;
  /** HTML tag name */
  tag: string;
  /** Normalized visible text content */
  text: string;
  /** Element ID attribute */
  id: string | null;
  /** Inferred or explicit ARIA role */
  role: string | null;
  /** Associated label text */
  label: string | null;
  /** aria-label attribute */
  ariaLabel: string | null;
  /** Input type attribute */
  typeAttr: string | null;
  /** Name attribute */
  nameAttr: string | null;
  /** href attribute for links */
  href: string | null;
  /** Data attributes (including testid) */
  dataset: Record<string, string>;
  /** 1-based index among same tag siblings */
  nthOfType: number;
}

/**
 * Options for capturing elements with markers
 */
export interface CaptureMarkersOptions {
  /** Only capture interactive elements (buttons, links, inputs, etc.) */
  interactableOnly?: boolean;
}

/**
 * Capture elements from the page using the markers system
 * 
 * This function replaces captureTargets() and uses marker IDs instead of TargetInfo.
 * It captures all elements that have been marked by the overlay system and returns
 * their metadata along with their mimic IDs.
 * 
 * @param page - Playwright Page object
 * @param options - Optional configuration for capturing elements
 * @returns Promise resolving to array of MarkerElementInfo objects
 */
export async function captureMarkers(
  page: Page,
  options: CaptureMarkersOptions = {}
): Promise<MarkerElementInfo[]> {
  const { interactableOnly = false } = options;
  
  return await page.evaluate((interactableOnlyFlag) => {
    const elements: MarkerElementInfo[] = [];
    
    // Get all elements with mimic IDs
    const allElements = document.querySelectorAll('[data-mimic-id]');
    
    // Define interactive selectors for filtering
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
    
    // Helper to check if element is visible
    function isVisible(el: Element): boolean {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    
    // Helper to normalize text
    function normalizeText(text: string): string {
      return text.trim().replace(/\s+/g, ' ');
    }
    
    // Helper to get label
    function getLabel(el: Element): string | null {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();
      
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return normalizeText(labelEl.textContent || '');
      }
      
      if (el.id) {
        const labelFor = document.querySelector(`label[for="${el.id}"]`);
        if (labelFor) return normalizeText(labelFor.textContent || '');
      }
      
      const parentLabel = el.closest('label');
      if (parentLabel) return normalizeText(parentLabel.textContent || '');
      
      return null;
    }
    
    // Helper to infer role
    function inferRole(el: Element): string | null {
      const role = el.getAttribute('role');
      if (role) return role;
      
      const tag = el.tagName.toLowerCase();
      if (tag === 'button') return 'button';
      if (tag === 'a') return 'link';
      if (tag === 'input') {
        const inputType = (el as HTMLInputElement).type;
        if (inputType === 'button' || inputType === 'submit' || inputType === 'reset') return 'button';
        if (inputType === 'checkbox') return 'checkbox';
        if (inputType === 'radio') return 'radio';
        return 'textbox';
      }
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'img') return 'img';
      
      return null;
    }
    
    // Helper to get dataset
    function getDataset(el: Element): Record<string, string> {
      const dataset: Record<string, string> = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        if (attr && attr.name && attr.name.startsWith('data-')) {
          let key = attr.name.replace(/^data-/, '');
          // Convert kebab-case to camelCase
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
          dataset[result] = attr.value;
        }
      }
      return dataset;
    }
    
    // Helper to get nth-of-type
    function getNthOfType(el: Element): number {
      const tagName = el.tagName;
      let nthOfType = 1;
      let sibling = el.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === tagName) {
          nthOfType++;
        }
        sibling = sibling.previousElementSibling;
      }
      return nthOfType;
    }
    
    // Process all elements with mimic IDs
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      
      // Skip if not visible
      if (!isVisible(el)) continue;
      
      // Filter by interactable only if requested
      if (interactableOnlyFlag) {
        let isInteractive = false;
        for (const selector of interactiveSelectors) {
          if (el.matches(selector)) {
            isInteractive = true;
            break;
          }
        }
        if (!isInteractive) continue;
      }
      
      // Get mimic ID
      const mimicIdAttr = el.getAttribute('data-mimic-id');
      if (!mimicIdAttr) continue;
      const mimicId = Number(mimicIdAttr);
      if (!mimicId || isNaN(mimicId)) continue;
      
      // Get element text
      const text = normalizeText(el.textContent || '');
      
      // Build element info
      const elementInfo: MarkerElementInfo = {
        mimicId,
        tag: el.tagName.toLowerCase(),
        text,
        id: el.id || null,
        role: inferRole(el),
        label: getLabel(el),
        ariaLabel: el.getAttribute('aria-label') || null,
        typeAttr: (el as HTMLInputElement).type || null,
        nameAttr: el.getAttribute('name') || null,
        href: (el as HTMLAnchorElement).href || null,
        dataset: getDataset(el),
        nthOfType: getNthOfType(el),
      };
      
      elements.push(elementInfo);
    }
    
    return elements;
  }, interactableOnly);
}

export const captureScreenshot = async (page: Page): Promise<{ image: Buffer, markers: MarkerInfo[], items: MarkerElementInfo[] }> => {
  const start = performance.now();
  
  // Add markers and get marker information (no CSS/visual changes)
  const markers = await addMarkerCode(page);
  console.log(`🏷️  [captureScreenshot] Added ${markers.length} markers`);
  
  // Take screenshot (no observer issues since we're not doing visual overlays)
  const image = await page.screenshot({ 
    fullPage: true,
    timeout: 300000 // 5 minutes for slow tests
  });
  const end = performance.now();
  console.log(`📸 [captureScreenshot] Screenshot captured in ${end - start}ms (${(end - start) / 1000}s)`);
  
  // Capture detailed marker element info
  const items = await captureMarkers(page);
  
  return { image, markers, items };
}