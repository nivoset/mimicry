/**
 * Smart Wait Module
 * 
 * Implements intelligent waiting that detects loading indicators and waits
 * for them to disappear, rather than using fixed timeouts.
 */

import { Page } from '@playwright/test';

/**
 * Common loading indicator selectors
 * These are common patterns for loading spinners, progress bars, etc.
 */
const LOADING_INDICATORS = [
  // Spinners and loaders
  '[class*="loading"]',
  '[class*="spinner"]',
  '[class*="loader"]',
  '[id*="loading"]',
  '[id*="spinner"]',
  '[id*="loader"]',
  // Progress indicators
  '[class*="progress"]',
  '[role="progressbar"]',
  // Common loading text
  'text=/loading/i',
  'text=/please wait/i',
  // Skeleton loaders
  '[class*="skeleton"]',
  // Overlay loaders
  '[class*="overlay"][class*="loading"]',
  // Data attributes
  '[data-loading="true"]',
  '[data-state="loading"]',
  '[aria-busy="true"]',
];

/**
 * Detect if there are any loading indicators visible on the page
 * 
 * @param page - Playwright Page object
 * @returns Promise resolving to array of visible loading indicator selectors
 */
export async function detectLoadingIndicators(page: Page): Promise<string[]> {
  const visibleLoaders: string[] = [];

  for (const selector of LOADING_INDICATORS) {
    try {
      // Check if selector matches any visible elements
      const count = await page.locator(selector).filter({ hasNotText: '' }).count();
      if (count > 0) {
        // Verify at least one is actually visible
        const first = page.locator(selector).first();
        const isVisible = await first.isVisible().catch(() => false);
        if (isVisible) {
          visibleLoaders.push(selector);
        }
      }
    } catch (error) {
      // Ignore errors from invalid selectors
      continue;
    }
  }

  return visibleLoaders;
}

/**
 * Wait for all loading indicators to disappear
 * 
 * @param page - Playwright Page object
 * @param timeout - Maximum time to wait in milliseconds (default: 10000)
 * @returns Promise that resolves when all loaders are gone, or rejects on timeout
 */
export async function waitForLoadersToDisappear(
  page: Page,
  timeout: number = 10000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const loaders = await detectLoadingIndicators(page);
    
    if (loaders.length === 0) {
      // All loaders are gone
      return;
    }

    // Wait a bit before checking again
    await page.waitForTimeout(100);
  }

  // Timeout reached, but don't throw - just log
  const remainingLoaders = await detectLoadingIndicators(page);
  if (remainingLoaders.length > 0) {
    console.warn(`⚠️  Loading indicators still visible after ${timeout}ms: ${remainingLoaders.join(', ')}`);
  }
}

/**
 * Smart wait that detects and waits for loading indicators
 * Falls back to fixed timeout if no loaders are detected
 * 
 * @param page - Playwright Page object
 * @param options - Wait options
 * @returns Promise that resolves when wait is complete
 */
export async function smartWait(
  page: Page,
  options: {
    /** Maximum time to wait for loaders (default: 10000ms) */
    loaderTimeout?: number;
    /** Fallback fixed timeout if no loaders detected (default: 1000ms) */
    fallbackTimeout?: number;
    /** Whether to wait for network idle (default: false) */
    waitForNetworkIdle?: boolean;
  } = {}
): Promise<{
  waitedForLoaders: boolean;
  loaderCount: number;
  duration: number;
}> {
  const startTime = Date.now();
  const {
    loaderTimeout = 10000,
    fallbackTimeout = 1000,
    waitForNetworkIdle = false,
  } = options;

  // First, check for loading indicators
  const loaders = await detectLoadingIndicators(page);

  if (loaders.length > 0) {
    console.log(`⏳ Detected ${loaders.length} loading indicator(s), waiting for them to disappear...`);
    await waitForLoadersToDisappear(page, loaderTimeout);
    const duration = Date.now() - startTime;
    return {
      waitedForLoaders: true,
      loaderCount: loaders.length,
      duration,
    };
  }

  // No loaders detected, use fallback timeout
  if (fallbackTimeout > 0) {
    console.log(`⏳ No loaders detected, waiting ${fallbackTimeout}ms...`);
    await page.waitForTimeout(fallbackTimeout);
  }

  // Optionally wait for network idle
  if (waitForNetworkIdle) {
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch (error) {
      // Ignore timeout errors for network idle
    }
  }

  const duration = Date.now() - startTime;
  return {
    waitedForLoaders: false,
    loaderCount: 0,
    duration,
  };
}

/**
 * Check if the page appears to be in a loading state
 * 
 * @param page - Playwright Page object
 * @returns Promise resolving to whether page is loading
 */
export async function isPageLoading(page: Page): Promise<boolean> {
  const loaders = await detectLoadingIndicators(page);
  return loaders.length > 0;
}
