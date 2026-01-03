import { test, expect } from '../test-utils';

/**
 * Test suite for multi-step-flow.html
 * Tests wizard-style multi-page flows with progress indicators and state persistence
 */

test.describe('Multi-Step Flow Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/multi-step-flow.html');
  });

  test('should display wizard start page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Multi-Step Flow Test Page');
    await expect(page.locator('#wizard-step-1')).toBeVisible();
    await expect(page.locator('#wizard-step-1')).toHaveClass(/active/);
  });

  test('should start wizard and navigate to step 2', async ({ page, mimic }) => {
    await mimic`click on "Start Wizard"`;

    await expect(page.locator('#wizard-step-2')).toBeVisible();
    await expect(page.locator('#wizard-step-1')).not.toBeVisible();
    await expect(page.locator('.step-indicator[data-step="2"]')).toHaveClass(/active/);
  });

  test('should fill step 2 information', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Test User" into the name field
      type "test@example.com" into the email field
    `;

    await expect(page.locator('#wizard-name')).toHaveValue('Test User');
    await expect(page.locator('#wizard-email')).toHaveValue('test@example.com');
  });

  test('should navigate to step 3 from step 2', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Alice" into the name field
      type "alice@test.com" into the email field
      click on "Next"
    `;

    await expect(page.locator('#wizard-step-3')).toBeVisible();
    await expect(page.locator('#wizard-step-2')).not.toBeVisible();
    await expect(page.locator('.step-indicator[data-step="3"]')).toHaveClass(/active/);
  });

  test('should go back to previous step', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Bob" into the name field
      click on "Next"
      click on "Previous"
    `;

    await expect(page.locator('#wizard-step-2')).toBeVisible();
    await expect(page.locator('#wizard-step-3')).not.toBeVisible();
    await expect(page.locator('#wizard-name')).toHaveValue('Bob');
  });

  test('should set preferences in step 3', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Charlie" into the name field
      type "charlie@test.com" into the email field
      click on "Next"
      check "Option 1"
      check "Option 2"
      select "Dark" from the theme dropdown
    `;

    await expect(page.locator('input[value="option1"]')).toBeChecked();
    await expect(page.locator('input[value="option2"]')).toBeChecked();
    await expect(page.locator('#wizard-theme')).toHaveValue('dark');
  });

  test('should navigate to review step', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Review User" into the name field
      type "review@test.com" into the email field
      click on "Next"
      check "Option 1"
      click on "Next"
    `;

    await expect(page.locator('#wizard-step-4')).toBeVisible();
    await expect(page.locator('#wizard-review')).toBeVisible();
  });

  test('should display review content with collected data', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Review Test" into the name field
      type "review@example.com" into the email field
      click on "Next"
      check "Option 1"
      check "Option 3"
      select "Auto" from the theme dropdown
      click on "Next"
    `;

    await expect(page.locator('#review-content')).toBeVisible();
    const reviewText = await page.locator('#review-content').textContent();
    expect(reviewText).toContain('Review Test');
    expect(reviewText).toContain('review@example.com');
  });

  test('should complete wizard', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Complete User" into the name field
      type "complete@test.com" into the email field
      click on "Next"
      check "Option 2"
      click on "Next"
      click on "Complete Wizard"
    `;

    await expect(page.locator('#wizard-complete')).toBeVisible();
    await expect(page.locator('#wizard-complete .alert.success')).toBeVisible();
    await expect(page.locator('#wizard-step-4')).not.toBeVisible();
  });

  test('should update progress bar as steps progress', async ({ page, mimic }) => {
    let progress = await page.locator('#wizard-progress').evaluate(el => (el as HTMLElement).style.width);
    expect(progress).toBe('0%');

    await mimic`click on "Start Wizard"`;
    progress = await page.locator('#wizard-progress').evaluate(el => (el as HTMLElement).style.width);
    expect(progress).toBe('25%');

    await mimic`
      type "Progress" into the name field
      click on "Next"
    `;
    progress = await page.locator('#wizard-progress').evaluate(el => (el as HTMLElement).style.width);
    expect(progress).toBe('50%');

    await mimic`
      check "Option 1"
      click on "Next"
    `;
    progress = await page.locator('#wizard-progress').evaluate(el => (el as HTMLElement).style.width);
    expect(progress).toBe('75%');

    await mimic`click on "Complete Wizard"`;
    progress = await page.locator('#wizard-progress').evaluate(el => (el as HTMLElement).style.width);
    expect(progress).toBe('100%');
  });

  test('should mark completed steps in indicators', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Indicator" into the name field
      click on "Next"
    `;

    await expect(page.locator('.step-indicator[data-step="1"]')).toHaveClass(/completed/);
    await expect(page.locator('.step-indicator[data-step="2"]')).toHaveClass(/active/);
  });

  test('should reset wizard and start over', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Reset User" into the name field
      click on "Next"
      check "Option 1"
      click on "Next"
      click on "Complete Wizard"
      click on "Start Over"
    `;

    await expect(page.locator('#wizard-step-1')).toBeVisible();
    await expect(page.locator('#wizard-complete')).not.toBeVisible();
    await expect(page.locator('#wizard-progress')).toHaveAttribute('style', /width: 0%/);
  });

  test('should navigate through all steps and back', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      type "Full Flow" into the name field
      type "full@test.com" into the email field
      click on "Next"
      check "Option 1"
      check "Option 2"
      check "Option 3"
      select "Light" from the theme dropdown
      click on "Next"
      click on "Previous"
      click on "Previous"
    `;

    // Should be back at step 2 with data preserved
    await expect(page.locator('#wizard-step-2')).toBeVisible();
    await expect(page.locator('#wizard-name')).toHaveValue('Full Flow');
    await expect(page.locator('#wizard-email')).toHaveValue('full@test.com');
  });

  test('should handle empty form submission', async ({ page, mimic }) => {
    await mimic`
      click on "Start Wizard"
      click on "Next"
      click on "Next"
      click on "Complete Wizard"
    `;

    // Should still complete (no validation in this example)
    await expect(page.locator('#wizard-complete')).toBeVisible();
  });
});
