/**
 * Playwright test suite for mimic flow
 */
import "dotenv/config";
import { test as base } from '@playwright/test';
import { createMimic, type Mimic } from '../src/mimic';
import { openai } from '@ai-sdk/openai';

export const brains = openai('gpt-4o-mini');

export * from '@playwright/test';

export const test = base.extend<{
  mimic: Mimic;
}>({
  mimic: createMimic({ brains }),
});