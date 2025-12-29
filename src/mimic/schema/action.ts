// zod-schemas.ts
import { z } from "zod";

/**
 * Shared: identifiers and primitive helpers
 */
export const zPoint = z.object({
  x: z.number().describe("X coordinate relative to the page or element bounding box."),
  y: z.number().describe("Y coordinate relative to the page or element bounding box."),
});

export const zMouseButton = z.enum(["left", "middle", "right"]).describe("Mouse button to use.");
export const zModifierKeys = z
  .array(z.enum(["Alt", "Control", "Meta", "Shift"]))
  .describe("Zero or more modifier keys held for this action.")
  .default([]);

export const zFrameDescription = z.object({
  pageGuid: z.string().describe("Stable GUID for the page instance."),
  pageAlias: z.string().describe("Human-friendly alias for the page (e.g., 'main', 'popup-1')."),
  framePath: z.array(z.string()).describe("Ordered list of frame selectors/aliases from top to target frame."),
});

/**
 * ACTION INTENT (PASS 1): coarse category only
 * Keep this small so an LLM can commit early with high accuracy.
 */
export const zActionKind = z
  .enum(["click", "form update", "navigation", "assertion", "other"])
  .describe("High-level action category.");

export const zGeneralActionPlan = z.object({
  kind: zActionKind.describe("Coarse action category chosen first."),
  description: z
    .string()
    .describe("the reasoning behind the classification based on the literal intent of the Gherkin step."),
});

/**
 * ACTION SUBTYPE (PASS 2): constrained sub-choices within the category? maybe add as object with values or special 
 */

export const zMouseType = z
  .enum(["click", "doubleClick", "hover"])
  .describe("Specific mouse action.");
export const zFormUpdateTypes = z
  .enum(["press", "type", "fill", 'select', 'uncheck', 'check', 'setInputFiles', 'clear'])
  .describe("Specific form action to update the form.");
export const zNavigationType = z
  .enum(["openPage", "navigate", "closePage", 'goBack', 'goForward', 'refresh', 'openInNewTab'])
  .describe("Specific navigation action.");
export const zAssertionType = z
  .enum(["text visible", "value visible", "checked visible", "aria snapshot visible", "screenshot of element"])
  .describe("Assertion subtype.");

export const zMouseAction = z.object({
  type: zMouseType,
  params: z.object({
    button: zMouseButton.nullish().default("left").describe("Optional, mouse button to use, not needed for hover, for others it will be left click by default."),
    position: zPoint.nullish().describe("Optional relative offset inside the target element."),
    modifiers: zModifierKeys.nullish().describe("Optional modifier keys to use, not needed for hover, for others it will be no modifiers by default."),
  }),
});

export const zFormUpdateAction = z.object({
  type: zFormUpdateTypes,
  params: z.object({
    value: z.string().describe("Value to set for the form update."),
    modifiers: zModifierKeys.nullish().describe("Optional modifier keys to use for the form update."),
  }),
});

// TODO: navigation or opening pop ups needs more work most likely
export const zNavigationAction = z.object({
  type: zNavigationType,
  params: z.object({
    url: z.string().describe("URL to navigate to. empty string if no url is needed."),
  }),
});

export type NavigationAction = z.infer<typeof zNavigationAction>;

/**
 * Click action result schema
 * Contains top candidate elements matched against a Gherkin step
 */
export const zClickActionResult = z.object({
  /**
   * Array of up to 5 candidate elements, ranked by likelihood
   * Each candidate includes its index in the original TargetInfo array
   */
  candidates: z
    .array(
      z.object({
        /**
         * Index in the original TargetInfo array (0-based)
         * Used to reference back to the captured element
         */
        index: z.number().int().min(0).describe("Index in the original TargetInfo array (0-based)"),
        /**
         * Element tag name (e.g., 'button', 'a', 'input')
         */
        tag: z.string().describe("Element tag name"),
        /**
         * Visible text content of the element
         */
        text: z.string().describe("Visible text content"),
        /**
         * Element ID attribute if present
         */
        id: z.string().nullable().describe("Element ID attribute if present"),
        /**
         * Inferred or explicit ARIA role
         */
        role: z.string().nullable().describe("Inferred or explicit ARIA role"),
        /**
         * Associated label text (from label element or aria-labelledby)
         */
        label: z.string().nullable().describe("Associated label text"),
        /**
         * aria-label attribute value
         */
        ariaLabel: z.string().nullable().describe("aria-label attribute value"),
        /**
         * Optional confidence score (0-1) indicating match likelihood
         * Using nullable instead of optional for compatibility with OpenAI structured outputs
         */
        confidence: z.number().min(0).nullable().describe("Confidence score (0-1) indicating match likelihood"),
      })
    )
    .max(5)
    .describe("Top 5 candidate elements ranked by likelihood"),
  /**
   * Single click type for all candidates
   * Determined from the Gherkin step (e.g., "right click", "double click")
   */
  clickType: z
    .enum(["left", "right", "double", "middle", "hover"])
    .describe("Click type determined from the Gherkin step"),
  /**
   * Brief explanation of the matching logic and reasoning
   */
  reasoning: z.string().describe("Brief explanation of the matching logic and reasoning"),
});

export type ClickActionResult = z.infer<typeof zClickActionResult>;

// TODO: this maybe needs to be more complex? to make sure it gives the right value and such
export const zAssertionAction = z.object({
  type: zAssertionType,
  params: z.object({
    expected: z.string().describe("Expected value to assert."),
  }),
});

// TODO: this probably will need to just be logged for now
export const zOtherAction = z.object({
  type: z.literal("custom"),
  params: z.record(z.string(), z.unknown()).describe("Custom parameters for the action."),
});

/**
 * ACTION SUBTYPE (PASS 2): Union of all subtype schemas with kind
 * This allows progressive refinement: first get kind, then get specific subtype.
 */
export const zActionPass2 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mouse") }).merge(zMouseAction),
  z.object({ kind: z.literal("form update") }).merge(zFormUpdateAction),
  z.object({ kind: z.literal("navigation") }).merge(zNavigationAction),
  z.object({ kind: z.literal("assertion") }).merge(zAssertionAction),
  z.object({ kind: z.literal("other") }).merge(zOtherAction),
]).describe("Action subtype determined after choosing action kind.");

/**
 * ACTION DETAILS (PASS 3): parameters, selector link, and signals
 * Each subtype has a focused schema to minimize ambiguity.
 */

// Mouse params
export const zMouseParams = z.object({
  button: zMouseButton.default("left"),
  clickCount: z.number().int().min(1).max(2).default(1).describe("1 for click, 2 for double-click."),
  position: zPoint.nullish().describe("Optional relative offset inside the target element."),
  modifiers: zModifierKeys,
});

// Keyboard params
export const zKeyboardPressParams = z.object({
  key: z
    .string()
    .describe("Single key to press. Use Playwright key names (e.g., 'Enter', 'Tab', 'ArrowDown', 'Control+K')."),
  modifiers: zModifierKeys,
});
export const zKeyboardTypeParams = z.object({
  text: z.string().describe("Literal text to type (respects existing cursor/focus)."),
  delayMs: z.number().int().min(0).default(0).describe("Optional delay per character."),
});
export const zKeyboardFillParams = z.object({
  value: z.string().describe("Final value of the input after filling (replaces existing content)."),
});

// Navigation params
export const zOpenPageParams = z.object({
  url: z.string().url().describe("Absolute URL to open in a new page/tab/context."),
});
export const zNavigateParams = z.object({
  url: z.string().describe("URL or path to navigate current page to."),
});
export const zClosePageParams = z.object({
  reason: z.string().nullish().describe("Optional rationale for closing (cleanup, end of flow, etc.)."),
});

// // Assertion params
// export const zAssertTextParams = z.object({
//   expected: z.union([z.string(), zRegexish]).describe("Exact string or regex to match against element text."),
//   substring: z.boolean().default(false).describe("If true, accept substring match for string expectations."),
// });
// export const zAssertValueParams = z.object({
//   expected: z.string().describe("Exact value for form controls or value properties."),
// });
// export const zAssertCheckedParams = z.object({
//   expected: z.boolean().describe("Expected checked state for checkboxes/switches."),
// });
// export const zAssertVisibleParams = z.object({
//   expected: z.boolean().default(true).describe("Visibility expectation (usually true)."),
// });
// export const zAssertSnapshotParams = z.object({
//   ariaSnapshot: z
//     .string()
//     .describe(
//       "Serialized ARIA snapshot to compare with a stored baseline. Use for accessibility-tree regressions."
//     ),
// });

// // Discriminated details by (kind, subtype)
// export const zActionPass3 = z.object({
//   kind: zActionKind,
//   subtype: z.union([zMouseType, zFormUpdateTypes, zNavigationType, zAssertionType, z.literal("custom")]),

//   // Selector is optional for navigation and some 'other' actions.
//   selectorPlan: zSelectorPlan.nullish().describe("Selector plan for element-targeting actions."),

//   // Params union:
//   params: z.union([
//     // mouse
//     z.object({ kind: z.literal("mouse"), subtype: z.literal("hover"), mouse: zMouseParams.partial() }),
//     z.object({ kind: z.literal("mouse"), subtype: z.literal("click"), mouse: zMouseParams }),
//     z.object({ kind: z.literal("mouse"), subtype: z.literal("doubleClick"), mouse: zMouseParams }),
//     z.object({ kind: z.literal("mouse"), subtype: z.literal("rightClick"), mouse: zMouseParams }),
//     z.object({ kind: z.literal("mouse"), subtype: z.literal("middleClick"), mouse: zMouseParams }),

//     // keyboard
//     z.object({ kind: z.literal("keyboard"), subtype: z.literal("press"), keyboardPress: zKeyboardPressParams }),
//     z.object({ kind: z.literal("keyboard"), subtype: z.literal("type"), keyboardType: zKeyboardTypeParams }),
//     z.object({ kind: z.literal("keyboard"), subtype: z.literal("fill"), keyboardFill: zKeyboardFillParams }),

//     // navigation
//     z.object({ kind: z.literal("navigation"), subtype: z.literal("openPage"), open: zOpenPageParams }),
//     z.object({ kind: z.literal("navigation"), subtype: z.literal("navigate"), nav: zNavigateParams }),
//     z.object({ kind: z.literal("navigation"), subtype: z.literal("closePage"), close: zClosePageParams }),

//     // assertions
//     z.object({ kind: z.literal("assertion"), subtype: z.literal("text"), assertText: zAssertTextParams }),
//     z.object({ kind: z.literal("assertion"), subtype: z.literal("value"), assertValue: zAssertValueParams }),
//     z.object({ kind: z.literal("assertion"), subtype: z.literal("checked"), assertChecked: zAssertCheckedParams }),
//     z.object({ kind: z.literal("assertion"), subtype: z.literal("visible"), assertVisible: zAssertVisibleParams }),
//     z.object({ kind: z.literal("assertion"), subtype: z.literal("snapshot"), assertSnapshot: zAssertSnapshotParams }),

//     // custom/other
//     z.object({
//       kind: z.literal("other"),
//       subtype: z.literal("custom"),
//       custom: z
//         .record(z.string(), z.unknown())
//         .describe("Opaque payload for advanced or framework-specific operations not covered above."),
//     }),
//   ]),

//   // Signals and timing:
//   signals: z.array(zSignal).default([]).describe("Expected browser signals causally tied to this action."),
//   timeoutMs: z.number().int().positive().default(30000).describe("Overall timeout for this action's completion."),
//   frame: zFrameDescription
//     .nullish()
//     .describe("Target frame context if different from the default/main frame."),
//   note: z
//     .string()
//     .nullish()
//     .describe("Freeform rationale or guidance produced during planning (e.g., flaky area, loading spinners)."),
// });

// /**
//  * COMPOSITES
//  * - Unified step container for the 3-pass workflow.
//  * - ActionInContext structure suitable for execution logs or replay.
//  */

// export const zActionPlan = z.object({
//   pass1: zGeneralActionPlan.describe("High-confidence category selection."),
//   pass2: zActionPass2.describe("Subtype specialization to narrow intent based on kind."),
//   pass3: zActionPass3.describe("Concrete parameters, selectors, and signals for execution."),
// });

// export const zActionInContext = z.object({
//   frame: zFrameDescription,
//   description: z.string().nullish(),
//   startTime: z.number().describe("Epoch ms when action started planning/execution."),
//   endTime: z.number().nullish().describe("Epoch ms when action completed (if executed)."),
//   plan: zActionPlan.describe("Full 3-pass plan for the action."),
// });

/**
 * Type exports for convenience
 */
export type Point = z.infer<typeof zPoint>;
// export type SelectorPlan = z.infer<typeof zSelectorPlan>;
// export type ActionPlan = z.infer<typeof zActionPlan>;
// export type ActionInContext = z.infer<typeof zActionInContext>;
