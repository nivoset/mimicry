/**
 * Playwright test suite for mimic flow
 */

import { test, expect } from '@playwright/test';
import { mimic } from './mimic.js';
import { ollama } from 'ollama-ai-provider-v2'
import { LanguageModel } from 'ai';

const brain = ollama('qwen2.5')

test.describe('Minimal Flow Example', () => {
  test('should execute flow and validate with Zod', async ({ page }) => {
    const result = await mimic(page, brain as LanguageModel, `
      navigate to https://jpmcworkers.com/
      click on "join the alliance"
    `);

    expect(result.success).toBe(true);
    expect(page.url()).toBe('https://jpmcworkers.com/');
  });

  test.skip('should handle empty input validation', async ({ page }) => {
    await expect(async () => {
      await mimic(page, brain as any, '');
    }).rejects.toThrow();
  });

  test.skip('should process different input values', async ({ page }) => {
    const testCases = [
      { input: 'Test', expectedProcessed: 'test', expectedResult: 'Processed: TEST' },
      { input: '  Multiple   Words  ', expectedProcessed: 'multiple   words', expectedResult: 'Processed: MULTIPLE   WORDS' },
      { input: 'UPPERCASE', expectedProcessed: 'uppercase', expectedResult: 'Processed: UPPERCASE' },
    ];

    for (const testCase of testCases) {
      const result = await mimic(page, brain, testCase.input);

      expect(result.success).toBe(true);
      expect(result.finalContext.processed).toBe(testCase.expectedProcessed);
      expect(result.finalContext.result).toBe(testCase.expectedResult);
    }
  });
});

