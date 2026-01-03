/**
 * Playwright test suite for mimic flow
 */
import "dotenv/config";
import { test as base } from '@playwright/test';
import { ollama } from 'ollama-ai-provider-v2'
import { createMimic, type Mimic } from '../src/mimic';

import { openai } from '@ai-sdk/openai';
import { LanguageModel } from 'ai';

const _ollamaBrain = ollama('gpt-oss') as LanguageModel

export const brains = openai('gpt-4o-mini');

export * from '@playwright/test';

export const test = base.extend<{
  mimic: Mimic
}>({
  mimic: async ({ page }, use, testInfo) => {
    const mimic = createMimic({
      page,
      brains,
      testInfo,
    })
    await use(mimic)
  }
});