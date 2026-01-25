/**
 * Selector Scoring Module
 * 
 * Handles scoring element matches to determine the best selector.
 * Uses scoring rules to compare element information against target information.
 */

import { Locator } from '@playwright/test';
import type { TargetInfo } from './selector.js';
import type { ElementInfo } from './elementInfo.js';
import { extractElementInfo } from './elementInfo.js';

/**
 * Score how well an element matches the target information
 * 
 * Higher score = better match. Scoring rules:
 * - Tag match: 10 points
 * - ID match: 30 points (very specific)
 * - Role match: 15 points
 * - Text match: 20 points (exact) or 10 points (partial)
 * - Aria-label match: 15 points
 * - Label match: 15 points
 * - Type attribute match: 10 points
 * - Name attribute match: 15 points
 * - Dataset match: 10 points (testid) or 5 points (others)
 * 
 * @param elementInfo - Element information to score
 * @param target - Target information to match against
 * @returns Score indicating match quality (0-100+)
 */
export function scoreElementMatch(
  elementInfo: ElementInfo,
  target: TargetInfo
): number {
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

  // Text match (20 points for exact, 10 for partial)
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
 * Score multiple elements and return sorted results
 * 
 * Extracts element information for all matches and scores them against the target.
 * Returns results sorted by score (highest first).
 * 
 * @param locator - Playwright Locator that matches multiple elements
 * @param target - Target information to match against
 * @returns Array of scored elements sorted by score (highest first)
 */
export async function scoreMultipleElements(
  locator: Locator,
  target: TargetInfo
): Promise<Array<{ index: number; score: number; elementInfo: ElementInfo }>> {
  const count = await locator.count();
  const scores: Array<{ index: number; score: number; elementInfo: ElementInfo }> = [];
  
  for (let i = 0; i < count; i++) {
    const elementLocator = locator.nth(i);
    const elementInfo = await extractElementInfo(elementLocator);
    const score = scoreElementMatch(elementInfo, target);
    scores.push({ index: i, score, elementInfo });
  }
  
  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);
  
  return scores;
}

/**
 * Find the best matching element from a locator that matches multiple elements
 * 
 * If the locator matches only one element, returns it directly.
 * If it matches multiple elements, scores each one and returns the best match.
 * 
 * @param locator - Playwright Locator (may match multiple elements)
 * @param target - Target information to match against
 * @returns Best matching element locator (using .nth() if needed)
 */
export async function findBestMatchingElement(
  locator: Locator,
  target: TargetInfo
): Promise<Locator> {
  const count = await locator.count();
  
  // If only one match, return it directly
  if (count <= 1) {
    return locator;
  }

  // Score all elements and find the best match
  const scores = await scoreMultipleElements(locator, target);
  
  // Return the best matching element using .nth()
  const bestMatch = scores[0];
  if (!bestMatch) {
    // Fallback to first element if somehow scores is empty
    return locator.first();
  }
  
  return locator.nth(bestMatch.index);
}
