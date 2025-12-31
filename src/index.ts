/**
 * Mimic - AI-powered browser testing framework
 * 
 * Main entry point exporting all public APIs
 */

// Main mimic functionality
export { mimic, createMimic, type Mimic } from './mimic.js';

// Mimic action types and utilities
export { getBaseAction } from './mimic/actionType.js';
export { getClickAction, executeClickAction } from './mimic/click.js';
export { getNavigationAction, executeNavigationAction } from './mimic/navigation.js';
export { getFormAction, executeFormAction, type FormActionResult } from './mimic/forms.js';
export { captureTargets, buildSelectorForTarget, type TargetInfo, type CaptureTargetsOptions } from './mimic/selector.js';

// Schema types
export type {
  NavigationAction,
  ClickActionResult,
  Point,
} from './mimic/schema/action.js';
