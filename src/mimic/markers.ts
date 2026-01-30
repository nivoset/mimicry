/**
 * Marker Code Module
 *
 * Provides functionality to add visual markers/badges to page elements
 * for debugging and element identification purposes.
 */

import type { Page } from '@playwright/test';
import { logger } from './logger.js';

/**
 * Minimal type for Sharp usage (metadata + composite) so the file compiles when Sharp is not installed.
 */
type SharpLike = (input: Buffer) => {
  metadata(): Promise<{ width?: number; height?: number }>;
  composite(overlays: Array<{ input: Buffer; left: number; top: number }>): {
    png(): { toBuffer(): Promise<Buffer> };
  };
};

/** Optional Sharp instance; null when Sharp is not installed or fails to load. */
let sharpImpl: SharpLike | null = null;
let sharpLoadAttempted = false;

/**
 * Load Sharp dynamically. Returns Sharp instance or null if unavailable (optionalDependency not installed or native binary missing).
 */
async function loadSharp(): Promise<SharpLike | null> {
  if (sharpLoadAttempted) return sharpImpl;
  sharpLoadAttempted = true;
  try {
    const m = await import('sharp');
    sharpImpl = m.default as SharpLike;
    return sharpImpl;
  } catch {
    sharpImpl = null;
    return null;
  }
}

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
  
    function isDisplayOnlyElement(el, depth) {
      // Prevent stack overflow by limiting depth to 50 levels
      const MAX_DEPTH = 50;
      if (depth === undefined) depth = 0;
      if (depth >= MAX_DEPTH) return false;
      
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
          if (!isDisplayOnlyElement(childEl, depth + 1)) return false;
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
      if (isDisplayOnlyElement(el, 0)) {
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

/** Marker circle size and radius (must match Sharp path and fallback). */
const MARKER_SIZE = 12;
const MARKER_RADIUS = MARKER_SIZE / 2;

/** Type-to-color mapping for markers (interactive, display, structure). */
const TYPE_COLORS: Record<MarkerInfo['type'], string> = {
  interactive: '#3B82F6', // Blue
  display: '#10B981',     // Green
  structure: '#F59E0B'    // Orange
};

/**
 * Draw colored markers on the screenshot using Playwright's browser canvas (fallback when Sharp is unavailable).
 * Runs in the browser via page.evaluate: load screenshot as Image, draw on canvas, draw circles, return data URL.
 *
 * @param imageBuffer - The screenshot image buffer (PNG)
 * @param markers - Array of marker information with positioning data
 * @param page - Playwright Page for evaluate
 * @returns Promise resolving to the modified image buffer with markers drawn
 */
async function drawMarkersOnScreenshotFallback(
  imageBuffer: Buffer,
  markers: MarkerInfo[],
  page: Page
): Promise<Buffer> {
  logger.info('Sharp unavailable; using Playwright canvas fallback for marker drawing');
  const screenshotBase64 = imageBuffer.toString('base64');
  const markerPayload = markers.map((m) => ({ rect: m.rect, type: m.type }));

  const dataUrl = await page.evaluate(
    async ({
      screenshotBase64: base64,
      markers: markerList,
      typeColors,
      markerSize,
      markerRadius
    }: {
      screenshotBase64: string;
      markers: Array<{ rect: { x: number; y: number; width: number; height: number }; type: MarkerInfo['type'] }>;
      typeColors: Record<string, string>;
      markerSize: number;
      markerRadius: number;
    }) => {
      return new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2d context not available'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageWidth = canvas.width;
          const imageHeight = canvas.height;

          for (const m of markerList) {
            const { rect, type } = m;
            const markerX = Math.max(
              0,
              Math.min(rect.x, imageWidth - markerSize)
            );
            const markerY = Math.max(
              0,
              Math.min(rect.y + rect.height / 2 - markerRadius, imageHeight - markerSize)
            );
            if (markerX < 0 || markerY < 0 || markerX >= imageWidth || markerY >= imageHeight) continue;

            const color = typeColors[type] ?? '#3B82F6';
            ctx.beginPath();
            ctx.arc(markerX + markerRadius, markerY + markerRadius, markerRadius - 1, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.9;
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to load screenshot image'));
        img.src = `data:image/png;base64,${base64}`;
      });
    },
    {
      screenshotBase64,
      markers: markerPayload,
      typeColors: TYPE_COLORS,
      markerSize: MARKER_SIZE,
      markerRadius: MARKER_RADIUS
    }
  );

  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

/**
 * Draw colored markers on the screenshot image
 *
 * Draws colored circular markers at the left center of each element's bounding box.
 * Uses Sharp when available; otherwise uses Playwright canvas fallback (no other library added).
 * Colors: Interactive #3B82F6, Display #10B981, Structure #F59E0B.
 *
 * @param imageBuffer - The screenshot image buffer
 * @param markers - Array of marker information with positioning data
 * @param page - Playwright Page (required for fallback when Sharp is unavailable)
 * @returns Promise resolving to the modified image buffer with markers drawn
 */
async function drawMarkersOnScreenshot(
  imageBuffer: Buffer,
  markers: MarkerInfo[],
  page: Page
): Promise<Buffer> {
  const sharp = await loadSharp();
  if (sharp) {
    return drawMarkersOnScreenshotWithSharp(imageBuffer, markers, sharp);
  }
  return drawMarkersOnScreenshotFallback(imageBuffer, markers, page);
}

/**
 * Sharp path: draw markers using sharp metadata + composite.
 */
async function drawMarkersOnScreenshotWithSharp(
  imageBuffer: Buffer,
  markers: MarkerInfo[],
  sharp: SharpLike
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;

  const overlays: Array<{ input: Buffer; left: number; top: number }> = [];

  for (const marker of markers) {
    const { rect, type } = marker;
    const markerX = Math.max(0, Math.min(rect.x, imageWidth - MARKER_SIZE));
    const markerY = Math.max(
      0,
      Math.min(rect.y + rect.height / 2 - MARKER_RADIUS, imageHeight - MARKER_SIZE)
    );
    if (markerX < 0 || markerY < 0 || markerX >= imageWidth || markerY >= imageHeight) {
      continue;
    }
    const color = TYPE_COLORS[type];
    const svg = `
      <svg width="${MARKER_SIZE}" height="${MARKER_SIZE}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${MARKER_RADIUS}" cy="${MARKER_RADIUS}" r="${MARKER_RADIUS - 1}"
                fill="${color}" stroke="white" stroke-width="1" opacity="0.9"/>
      </svg>
    `;
    overlays.push({
      input: Buffer.from(svg),
      left: Math.round(markerX),
      top: Math.round(markerY)
    });
  }

  if (overlays.length > 0) {
    return sharp(imageBuffer).composite(overlays).png().toBuffer();
  }
  return imageBuffer;
}

export const captureScreenshot = async (page: Page): Promise<{ image: Buffer, markers: MarkerInfo[] }> => {
  const start = performance.now();
  
  // Add markers and get marker information (no CSS/visual changes)
  const markers = await addMarkerCode(page);
  logger.info({ markerCount: markers.length }, `🏷️  [captureScreenshot] Added ${markers.length} markers`);
  
  // Take screenshot (no observer issues since we're not doing visual overlays)
  const image = await page.screenshot({ 
    fullPage: true,
    timeout: 30000 // 30 seconds
  });
  const screenshotTime = performance.now() - start;
  logger.info({ screenshotTime }, `📸 [captureScreenshot] Screenshot captured in ${screenshotTime}ms (${(screenshotTime / 1000).toFixed(2)}s)`);
  
  // Draw colored markers on the screenshot (Sharp when available, else Playwright canvas fallback)
  const markerDrawStart = performance.now();
  const imageWithMarkers = await drawMarkersOnScreenshot(image, markers, page);
  const markerDrawTime = performance.now() - markerDrawStart;
  logger.info({ markerCount: markers.length, markerDrawTime }, `🎨 [captureScreenshot] Drew ${markers.length} markers on screenshot in ${markerDrawTime}ms (${(markerDrawTime / 1000).toFixed(2)}s)`);
  
  const end = performance.now();
  logger.debug({ totalTime: end - start }, `⏱️  [captureScreenshot] Total time: ${end - start}ms (${((end - start) / 1000).toFixed(2)}s)`);
  
  return { image: imageWithMarkers, markers };
}

/**
 * Accessibility snapshot node structure
 * Similar to Playwright's accessibility snapshot but includes data-testid and data-mimic-* attributes
 */
export interface AriaSnapshotNode {
  /** ARIA role of the element */
  role: string;
  /** Accessible name of the element */
  name: string;
  /** Additional ARIA attributes (checked, disabled, expanded, level, pressed, selected, etc.) */
  attributes?: Record<string, string | boolean | number>;
  /** data-testid attribute if present */
  testId?: string;
  /** data-mimic-id attribute if present */
  mimicId?: number;
  /** data-mimic-type attribute if present */
  mimicType?: string;
  /** Child nodes in the accessibility tree */
  children?: AriaSnapshotNode[];
}

/**
 * Generate an accessibility snapshot of the page with markers and test IDs
 * 
 * Creates a tree structure similar to Playwright's accessibility snapshot, but includes:
 * - Only visible elements (skips hidden elements)
 * - data-testid attributes
 * - data-mimic-* attributes (data-mimic-id, data-mimic-type)
 * 
 * The snapshot follows Playwright's format:
 * - role "name" [attribute=value]
 * 
 * @param page - Playwright Page object
 * @returns Promise resolving to accessibility snapshot as a string (YAML-like format)
 */
export async function generateAriaSnapshot(page: Page): Promise<string> {
  // First, ensure markers are added to the page
  await addMarkerCode(page);
  
  // Generate the accessibility snapshot with markers and test IDs
  const snapshot = await page.evaluate(() => {
    /**
     * Check if an element is visible
     */
    function isVisible(el: Element): boolean {
      if (!(el instanceof Element)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    /**
     * Get the accessible name of an element
     * Uses ARIA labels, associated labels, or text content
     */
    function getAccessibleName(el: Element): string {
      // Check for aria-label first
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();

      // Check for aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) {
          const labelText = labelEl.textContent?.trim();
          if (labelText) return labelText;
        }
      }

      // Check for associated label element
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) {
          const labelText = label.textContent?.trim();
          if (labelText) return labelText;
        }
      }

      // For input elements, check placeholder
      if (el instanceof HTMLInputElement && el.placeholder) {
        return el.placeholder;
      }

      // For images, check alt text
      if (el instanceof HTMLImageElement && el.alt) {
        return el.alt;
      }

      // Fall back to text content (for headings, paragraphs, etc.)
      const text = el.textContent?.trim();
      if (text && text.length > 0 && text.length < 200) {
        return text;
      }

      return '';
    }

    /**
     * Get the ARIA role of an element
     */
    function getRole(el: Element): string {
      // Check explicit role attribute
      const explicitRole = el.getAttribute('role');
      if (explicitRole) return explicitRole;

      // Infer role from tag name
      const tag = el.tagName.toLowerCase();
      const roleMap: Record<string, string> = {
        'button': 'button',
        'a': 'link',
        'input': getInputRole(el as HTMLInputElement),
        'select': 'combobox',
        'textarea': 'textbox',
        'img': 'img',
        'h1': 'heading',
        'h2': 'heading',
        'h3': 'heading',
        'h4': 'heading',
        'h5': 'heading',
        'h6': 'heading',
        'ul': 'list',
        'ol': 'list',
        'li': 'listitem',
        'nav': 'navigation',
        'main': 'main',
        'article': 'article',
        'section': 'region',
        'aside': 'complementary',
        'header': 'banner',
        'footer': 'contentinfo',
        'form': 'form',
        'table': 'table',
        'thead': 'rowgroup',
        'tbody': 'rowgroup',
        'tfoot': 'rowgroup',
        'tr': 'row',
        'th': 'columnheader',
        'td': 'cell',
      };

      return roleMap[tag] || 'generic';
    }

    /**
     * Get role for input elements based on type
     */
    function getInputRole(input: HTMLInputElement): string {
      // Defensive check: input.type might be undefined or null
      const type = (input.type || 'text').toLowerCase();
      switch (type) {
        case 'checkbox':
          return 'checkbox';
        case 'radio':
          return 'radio';
        case 'button':
        case 'submit':
        case 'reset':
          return 'button';
        default:
          return 'textbox';
      }
    }

    /**
     * Get ARIA attributes from element
     */
    function getAriaAttributes(el: Element): Record<string, string | boolean | number> {
      const attrs: Record<string, string | boolean | number> = {};

      // Check common ARIA attributes
      const ariaAttrs = [
        'checked', 'disabled', 'expanded', 'level', 'pressed', 'selected',
        'valuemin', 'valuemax', 'valuenow', 'valuetext', 'current', 'live',
        'atomic', 'relevant', 'busy', 'readonly', 'multiline', 'multiselectable'
      ];

      for (const attr of ariaAttrs) {
        const value = el.getAttribute(`aria-${attr}`);
        if (value !== null) {
          // Convert to appropriate type
          if (value === 'true') attrs[attr] = true;
          else if (value === 'false') attrs[attr] = false;
          else if (!isNaN(Number(value))) attrs[attr] = Number(value);
          else attrs[attr] = value;
        }
      }

      // Check HTML attributes that map to ARIA
      if (el instanceof HTMLInputElement) {
        if (el.type === 'checkbox' || el.type === 'radio') {
          attrs.checked = el.checked;
        }
        if (el.disabled) attrs.disabled = true;
        if (el.readOnly) attrs.readonly = true;
      }

      if (el instanceof HTMLDetailsElement) {
        attrs.expanded = el.open;
      }

      return attrs;
    }

    /**
     * Build accessibility snapshot node from element
     */
    function buildSnapshotNode(el: Element, depth: number = 0): any {
      // Skip non-visible elements
      if (!isVisible(el)) return null;

      // Skip script, style, and other non-accessible elements
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'meta', 'link', 'noscript'].includes(tag)) {
        return null;
      }

      const role = getRole(el);
      const name = getAccessibleName(el);
      const attributes = getAriaAttributes(el);

      // Get data-testid
      const testId = el.getAttribute('data-testid') || undefined;

      // Get data-mimic-* attributes
      const mimicId = el.getAttribute('data-mimic-id');
      const mimicType = el.getAttribute('data-mimic-type') || undefined;

      // Build children array (only for visible children)
      const children: any[] = [];
      for (const child of Array.from(el.children)) {
        const childNode = buildSnapshotNode(child, depth + 1);
        if (childNode) {
          children.push(childNode);
        }
      }

      // Build node
      const node: any = {
        role,
        name: name || '',
        ...(Object.keys(attributes).length > 0 && { attributes }),
        ...(testId && { testId }),
        ...(mimicId && { mimicId: Number(mimicId) }),
        ...(mimicType && { mimicType }),
        ...(children.length > 0 && { children }),
      };

      return node;
    }

    /**
     * Convert snapshot node to YAML-like string format
     */
    function nodeToYaml(node: any, indent: number = 0): string {
      const indentStr = '  '.repeat(indent);
      const parts: string[] = [];

      // Build attribute string
      const attrParts: string[] = [];
      if (node.attributes) {
        for (const [key, value] of Object.entries(node.attributes)) {
          if (typeof value === 'boolean') {
            attrParts.push(`${key}=${value}`);
          } else if (typeof value === 'number') {
            attrParts.push(`${key}=${value}`);
          } else {
            attrParts.push(`${key}="${value}"`);
          }
        }
      }
      if (node.testId) {
        attrParts.push(`data-testid="${node.testId}"`);
      }
      if (node.mimicId !== undefined) {
        attrParts.push(`data-mimic-id=${node.mimicId}`);
      }
      if (node.mimicType) {
        attrParts.push(`data-mimic-type="${node.mimicType}"`);
      }

      const attrStr = attrParts.length > 0 ? ` [${attrParts.join(' ')}]` : '';
      const nameStr = node.name ? ` "${node.name}"` : '';
      const line = `${indentStr}- ${node.role}${nameStr}${attrStr}`;

      parts.push(line);

      // Add children
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          parts.push(nodeToYaml(child, indent + 1));
        }
      }

      return parts.join('\n');
    }

    // Start from body element
    const body = document.body;
    if (!body) return '';

    const rootNode = buildSnapshotNode(body);
    if (!rootNode) return '';

    return nodeToYaml(rootNode);
  });

  return snapshot;
}