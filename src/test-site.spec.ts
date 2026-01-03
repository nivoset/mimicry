import { test, expect } from './test-utils';

/**
 * Test suite for the test-site static pages
 * These tests demonstrate using Mimic with the local test-site served by http-server
 */

test.describe('Test Site - Simple Navigation', () => {
  test('should navigate to simple navigation page and click links', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/simple-navigation.html
      click on "Go to Forms Page"
    `;

    expect(page.url()).toContain('forms-basic.html');
  });

  test('should navigate back using browser history', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/simple-navigation.html
      click on "Go to Buttons Page"
      go back
    `;

    expect(page.url()).toContain('simple-navigation.html');
  });
});

test.describe('Test Site - Basic Forms', () => {
  test('should fill out and submit basic form', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/forms-basic.html
      type "John Doe" into the name field
      type "john@example.com" into the email field
      select "United States" from the country dropdown
      check "Daily Newsletter"
      click on "Submit Form"
    `;

    // Verify form was submitted using ARIA-based selectors
    // Use getByRole for the result container (region or article role would be ideal, but div with accessible name works)
    await expect(page.getByTestId('form-result')).toBeVisible();
    // Use getByTestId for the form data display area
    await expect(page.getByTestId('form-data')).toContainText('John Doe');
  });
});

test.describe('Test Site - Button Variety', () => {
  test('should click button with text label', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/buttons-variety.html
      click on "Click Me"
    `;

    // Verify action was logged using test ID for stable selector
    await expect(page.getByTestId('click-results')).toBeVisible();
  });

  test('should click button with aria-label', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/buttons-variety.html
      click on the button with aria-label "Close dialog"
    `;

    // Verify action was logged using test ID for stable selector
    await expect(page.getByTestId('click-results')).toBeVisible();
  });
});

test.describe('Test Site - Dynamic Content', () => {
  test('should wait for dynamically loaded content', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/dynamic-content.html
      click on "Load Content"
    `;

    // Wait for content to appear using test ID for stable selector
    // Mimic should handle waiting automatically
    await expect(page.getByTestId('dynamic-content-area')).toContainText('Content Loaded');
  });

  test('should toggle element visibility', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/dynamic-content.html
      click on "Toggle Visibility"
    `;

    // Verify content is hidden using test ID for stable selector
    const content = page.getByTestId('toggleable-content');
    const display = await content.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });
});

test.describe('Test Site - Complex Layout', () => {
  test('should open and close modal', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/layout-complex.html
      click on "Open Simple Modal"
    `;

    // Verify modal is visible using ARIA role for accessibility-first approach
    // Using getByRole with name to ensure we get the correct modal (avoids duplicates)
    await expect(page.getByRole('dialog', { name: 'Simple Modal' })).toBeVisible();
    
    await mimic`click on "Close"`;

    // Verify modal is hidden using ARIA role
    await expect(page.getByRole('dialog', { name: 'Simple Modal' })).not.toBeVisible();
  });

  test('should switch tabs', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/layout-complex.html
      click on "Tab 2"
    `;

    // Verify tab 2 content is visible using test IDs for stable selectors
    // Test IDs ensure we get the correct tab panel and avoid duplicates
    await expect(page.getByTestId('tab-content-2')).toBeVisible();
    await expect(page.getByTestId('tab-content-1')).not.toBeVisible();
  });
});

test.describe('Test Site - Multi-Step Flow', () => {
  test('should complete multi-step wizard', async ({ page, mimic }) => {
    await mimic`
      navigate to /pages/multi-step-flow.html
      click on "Start Wizard"
      type "Test User" into the name field
      type "test@example.com" into the email field
      click on "Next"
      check "Option 1"
      click on "Next"
      click on "Complete Wizard"
    `;

    // Verify wizard completed using test ID for stable selector
    await expect(page.getByTestId('wizard-complete')).toBeVisible();
  });
});
