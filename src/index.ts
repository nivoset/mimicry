/**
 * Mimicry - AI-powered browser testing framework
 * 
 * Main entry point exporting all public APIs
 */

// Main mimicry functionality
export { mimicry, createMimicry, type Mimicry } from './mimicry.js';

// Mimicry action types and utilities
export { getBaseAction } from './mimicry/actionType.js';
export { getClickAction, executeClickAction } from './mimicry/click.js';
export { getNavigationAction, executeNavigationAction } from './mimicry/navigation.js';
export { getFormAction, executeFormAction, type FormActionResult } from './mimicry/forms.js';
export { captureTargets, buildSelectorForTarget, type TargetInfo, type CaptureTargetsOptions } from './mimicry/selector.js';

// Schema types
export type {
  NavigationAction,
  ClickActionResult,
  Point,
} from './mimicry/schema/action.js';
