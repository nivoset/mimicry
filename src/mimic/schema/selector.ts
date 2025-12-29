import { z } from 'zod'

/**
 * SELECTOR PLAN (recursive, chainable)
 * Goal: build robust, readable, and reproducible selectors in <= 3 passes.
 *
 * Pass strategy:
 *  - Pass 1: choose anchor strategy and key argument(s) (e.g., getByRole('button', { name: /submit/i }))
 *  - Pass 2: refine via chaining (ancestor/descendant, nth, filter by attributes/ARIA/visible)
 *  - Pass 3: finalize stability hints (timeouts, required, fallback alternates)
 */

export const zSelectorStrategy = z.enum([
  "role",        // getByRole(role, { name? exact? level? })
  "testId",      // getByTestId(id)
  "label",       // getByLabel(text, { exact? })
  "placeholder", // getByPlaceholder(text)
  "altText",     // getByAltText(text)
  "text",        // getByText(text, { exact? })
  "title",       // getByTitle(text)
  "css",         // locator('css=...')
  "xpath",       // locator('xpath=...')
  "id",          // locator('#id')
  "dataAttr",    // locator('[data-attr=value]')
  "aria",        // locator('[aria-...]') or combinations derived from ARIA snapshot
  "nth",         // .nth(index)
  "filter",      // .filter({ hasText?, has? })
  "within",      // .locator('...').locator('...') - logical grouping for scope narrowing
  "frame",       // frameLocator('iframe-selector')
  "shadow",      // .locator(':shadow ...') or dedicated shadow traverse
]).describe("Mechanism used to locate or refine the target element.");

export const zRegexish = z.object({
  pattern: z.string().describe("Raw text or regex source (without slashes)."),
  flags: z.string().nullish().describe("Regex flags such as 'i', 'm', 's'."),
});



export const zInteractiveRole = z.enum([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "menuitem",
  "option",
  "tab",
  "switch",
]).describe("ARIA role for interactive elements that users can interact with (click, type, select, etc.).");

export const zDisplayRole = z.enum([
  "heading",
  "tabpanel",
  "img",
  "dialog",
  "listitem",
  "progressbar",
  "table",
  "row",
  "cell",
  "article",
  "navigation",
  "region",
  "form",
  "list",
  "grid",
  "gridcell",
  "status",
  "alert",
  "tooltip",
  "separator",
  "presentation",
]).describe("ARIA role for display and organizational elements that present or structure data.");

export const zRole = z.union([zInteractiveRole, zDisplayRole]).describe("ARIA role derived from snapshot or accessibility tree.");

export const zSelectorNode = z.object({
  strategy: zSelectorStrategy,
  /**
   * Arguments vary by strategy:
   *  - role: { role, name?, exact?, level? }
   *  - testId/label/placeholder/altText/text/title: { text|id: string|regexish, exact? }
   *  - css/xpath/id/dataAttr/aria: { query: string }
   *  - nth: { index: number }
   *  - filter: { hasText?: string|regexish, has?: SelectorNode (single child) }
   *  - within: { scope: SelectorNode[] } (group of nodes combined to create a narrowed context)
   *  - frame: { frameSelector: SelectorNode } (how to reach the iframe)
   *  - shadow: { query: string } (shadow traversal details)
   */
  args: z.record(z.string(), z.unknown()).describe("Strategy-specific arguments (see description above)."),
  note: z
    .string()
    .nullish()
    .describe("Human-readable hint about why this step is used (stability, clarity, ARIA alignment, etc.)."),
});

export const zSelectorPass1 = z.object({
  targetKind: z.enum(["element", "page", "frame"]).default("element").describe("What is being selected."),
  primary: zSelectorNode.describe("First (anchor) node, chosen for stability/semantics."),
});

export const zSelectorPass2 = z.object({
  chain: z
    .array(zSelectorNode)
    .default([])
    .describe("Additional nodes to narrow scope, filter, nth, within, frame/shadow traversals."),
});

export const zSelectorPass3 = z.object({
  required: z
    .boolean()
    .default(true)
    .describe("If true, the selector must resolve to at least one stable element."),
  timeoutMs: z.number().int().positive().default(5000).describe("Max wait for the final selector to resolve."),
  fallbacks: z
    .array(z.object({ primary: zSelectorNode, chain: z.array(zSelectorNode).default([]) }))
    .default([])
    .describe("Alternate selector chains if the primary fails (built from the same page state)."),
  ref: z.string().nullish().describe("Optional alias to reuse this resolved locator elsewhere."),
});

export const zSelectorPlan = z.object({
  pass1: zSelectorPass1.describe("Anchor selection strategy with semantic intent."),
  pass2: zSelectorPass2.describe("Refinements to reach an unambiguous element."),
  pass3: zSelectorPass3.describe("Stability, timing, and fallback controls."),
});