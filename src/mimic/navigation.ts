import { type LanguageModel, generateText, Output } from 'ai'
import { Page } from '@playwright/test'

import {
  zNavigationAction,
  type NavigationAction
} from './schema/action.js'

export const getNavigationAction = async (
  _page: Page, 
  brain: LanguageModel, 
  action: string
): Promise<NavigationAction> => {
  const res = await generateText({
    model: brain,
    prompt: `You are an expert in converting Gherkin test steps into structured browser automation action objects using Playwright.

Your task is to process a single Gherkin step and determine whether it represents a **navigation** action.
Input Gherkin step: ${action}
    
    `,
    output: Output.object({ schema: zNavigationAction, name: 'navigation' }),
  });

  return res.output;
};

export const executeNavigationAction = async (
  page: Page, 
  navigationAction: NavigationAction
): Promise<void> => {
  switch (navigationAction.type) {
    case 'openPage':
      await page.goto(navigationAction.params.url, { waitUntil: 'networkidle' });
      break;
    case 'navigate':
      await page.goto(navigationAction.params.url, { waitUntil: 'networkidle' });
      break;
    case 'closePage':
      await page.close();
      break;
    case 'goBack':
      await page.goBack();
      break;
    case 'goForward':
      await page.goForward();
      break;
    case 'refresh':
      await page.reload();
      break;
    default:
      throw new Error(`Unknown navigation action type: ${navigationAction.type}`);
  }
};