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

Your task is to process a single Gherkin step and determine whether it represents a **navigation** action. this can be any of the following:
- navigate to a page (this requires a url, if no url is provided, you should pick another option)
- closePage: close the current page
- goBack: go back to the previous page, or navigate back in the browser history
- goForward: go forward to the next page, or navigate forward in the browser history
- refresh: refresh the current page, or reload the page

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
      console.log('Opening page', navigationAction.params.url);
      await page.goto(navigationAction.params.url, { waitUntil: 'networkidle' });
      break;
    case 'navigate':
      console.log('Navigating to', navigationAction.params.url);
      await page.goto(navigationAction.params.url, { waitUntil: 'networkidle' });
      break;
    case 'closePage':
      console.log('Closing page');
      await page.close();
      break;
    case 'goBack':
      console.log('Going back');  
      await page.goBack();
      break;
    case 'goForward':
      console.log('Going forward');
      await page.goForward();
      break;
    case 'refresh':
      console.log('Refreshing page');
      await page.reload();
      break;
    default:
      throw new Error(`Unknown navigation action type: ${navigationAction.type}`);
  }
};