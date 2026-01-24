import { test, expect } from './test-utils';


test.describe('Minimal Flow Example', { tag: ['@example', '@navigation'] }, () => {
  test('should execute flow and validate with Zod', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    // Navigate to playwright.dev homepage
    await mimic`navigate to https://playwright.dev/`;
    
    // Wait for page to load completely before proceeding
    await page.waitForLoadState('networkidle');
    
    // Click on "Get started" link - this will navigate to /docs/intro
    await mimic`click on "get started"`;
    
    // Wait for navigation to complete after clicking the link
    // Playwright's click() waits for navigation, but we add explicit wait for stability
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the intro page before clicking trace viewer
    expect(page.url()).toContain('/docs/intro');
    
    // Click on "Trace viewer" link in the sidebar - this should navigate to /docs/trace-viewer-intro
    // Be more specific to avoid ambiguity with multiple "trace viewer" links on the page
    await mimic`click on "trace viewer" in the getting started section`;
    
    // Wait for navigation to complete
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the trace viewer intro page
    expect(page.url()).toBe('https://playwright.dev/docs/trace-viewer-intro');

    // Go back in browser history
    await mimic`go back`;
    
    // Wait for navigation to complete
    await page.waitForLoadState('networkidle');
    
    // Verify we're back on the intro page
    expect(page.url()).toBe('https://playwright.dev/docs/intro');
  });


});

