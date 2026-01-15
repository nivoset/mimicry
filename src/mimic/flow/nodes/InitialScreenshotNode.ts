/**
 * Initial Screenshot Node
 * 
 * Captures initial screenshot with markers at the start of test execution.
 * This provides a visual reference of the initial page state.
 */

import { Node } from 'pocketflow';
import { test } from '@playwright/test';
import type { MimicSharedState } from '../types.js';
import { captureScreenshot } from '../../markers.js';

/**
 * Initial Screenshot Node - Captures initial page state
 * 
 * Responsibilities:
 * - Capture screenshot with markers
 * - Attach screenshot to test report
 * - Set test timeout to slow (for AI operations)
 */
export class InitialScreenshotNode extends Node<MimicSharedState> {
  /**
   * Prepare: Read page and testInfo from shared state
   */
  async prep(shared: MimicSharedState): Promise<{
    page: MimicSharedState['page'];
    testInfo: MimicSharedState['testInfo'];
  }> {
    return {
      page: shared.page,
      testInfo: shared.testInfo,
    };
  }

  /**
   * Execute: Capture screenshot and attach to test report
   */
  async exec({
    page,
    testInfo,
  }: {
    page: MimicSharedState['page'];
    testInfo: MimicSharedState['testInfo'];
  }): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('📸 [mimic] Capturing initial screenshot with markers for test attachment...');
      const { image: screenshot } = await captureScreenshot(page);
      console.log(`📸 [mimic] Screenshot captured (${(screenshot.length / 1024).toFixed(2)}KB)`);

      // Attach screenshot to test report if testInfo is available
      // This makes it visible in Playwright HTML reports like a regular screenshot
      if (testInfo) {
        await testInfo.attach('initial-page-with-markers.png', {
          body: screenshot,
          contentType: 'image/png',
        });
        console.log('📎 [mimic] Screenshot attached to test report');
      }

      // Set test timeout to slow (for AI operations)
      test.slow(true);

      return { success: true };
    } catch (error) {
      // If screenshot capture fails, log but don't fail the test
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠️  [mimic] Failed to capture initial screenshot:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Post: Continue to step processing
   */
  async post(
    shared: MimicSharedState,
    _prepRes: { page: MimicSharedState['page']; testInfo: MimicSharedState['testInfo'] },
    _execRes: { success: boolean; error?: string }
  ): Promise<string | undefined> {
    // Continue to step processing
    return 'default';
  }
}
