import { test, expect } from './test-utils';


test.describe('Minimal Flow Example', () => {
  test('should execute flow and validate with Zod', async ({ page, mimicry }) => {
    await mimicry`
      navigate to https://playwright.dev/
      click on "get started"
      and click on "trace viewer"
    `;

    // expect(page).toHaveScreenshot();
    expect(page.url()).toBe('https://playwright.dev/docs/trace-viewer-intro');

    
    await mimicry`go back`;

    
    expect(page.url()).toBe('https://playwright.dev/docs/intro');
  });

  // test.skip('should handle empty input validation', async ({ page }) => {
  //   await expect(async () => {
  //     await mimic(page, brain, '');
  //   }).rejects.toThrow();
  // });

  // test.skip('should process different input values', async ({ page }) => {
  //   const testCases = [
  //     { input: 'Test', expectedProcessed: 'test', expectedResult: 'Processed: TEST' },
  //     { input: '  Multiple   Words  ', expectedProcessed: 'multiple   words', expectedResult: 'Processed: MULTIPLE   WORDS' },
  //     { input: 'UPPERCASE', expectedProcessed: 'uppercase', expectedResult: 'Processed: UPPERCASE' },
  //   ];

  //   for (const testCase of testCases) {
  //     const result = await mimic(page, brain, testCase.input);

  //     expect(result.success).toBe(true);
  //     expect(result.finalContext.processed).toBe(testCase.expectedProcessed);
  //     expect(result.finalContext.result).toBe(testCase.expectedResult);
  //   }
  // });
});

