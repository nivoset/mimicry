/**
 * Playwright test suite for mimicry flow
 */
import "dotenv/config";
import { test as base } from '@playwright/test';
import { ollama } from 'ollama-ai-provider-v2'
import { createMimicry, type Mimicry } from '../src/mimicry';

import { openai } from '@ai-sdk/openai';
import { LanguageModel } from 'ai';

const _ollamaBrain = ollama('gpt-oss') as LanguageModel

const brains = openai('gpt-4o-mini');

export * from '@playwright/test';

export const test = base.extend<{
  mimicry: Mimicry
}>({
  mimicry: async ({ page }, use, testInfo) => {
    const mimicry = createMimicry({
      page,
      brains,
      eyes: brains,
      testInfo,
    })
    await use(mimicry)
  }
});