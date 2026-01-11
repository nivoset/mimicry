import { test, expect } from './test-utils';


test.describe('Minimal Flow Example', { tag: ['@example', '@navigation'] }, () => {
  test('should execute flow and validate with Zod', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      navigate to https://playwright.dev/
      click on "get started"
      and click on "trace viewer"
    `;

    // expect(page).toHaveScreenshot();
    expect(page.url()).toBe('https://playwright.dev/docs/trace-viewer-intro');

    
    await mimic`go back`;

    
    expect(page.url()).toBe('https://playwright.dev/docs/intro');
  });


});

