import { test, expect } from '../test-utils';

/**
 * Test suite for buttons-variety.html
 * Tests button selection with various text labels, aria-labels, icons, and semantic HTML
 */

test.describe('Button Variety Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/buttons-variety.html');
  });

  test('should display all button sections', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Button Variety Test Page');
    await expect(page.locator('.card')).toHaveCount(7); // 7 card sections
  });

  test('should click button with text label "Click Me"', async ({ page, mimic }) => {
    await mimic`click on "Click Me"`;

    await expect(page.locator('#click-results')).toBeVisible();
    await expect(page.locator('#click-results .alert')).toContainText('Click Me');
  });

  test('should click button with text "Submit"', async ({ page, mimic }) => {
    await mimic`click on "Submit"`;

    await expect(page.locator('#click-results')).toBeVisible();
    await expect(page.locator('#click-results .alert')).toContainText('Submit');
  });

  test('should click button with text "Save Changes"', async ({ page, mimic }) => {
    await mimic`click on "Save Changes"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click button with text "Cancel"', async ({ page, mimic }) => {
    await mimic`click on "Cancel"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click button with text "Delete"', async ({ page, mimic }) => {
    await mimic`click on "Delete"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click button with aria-label "Close dialog"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Close dialog"`;

    await expect(page.locator('#click-results')).toBeVisible();
    await expect(page.locator('#click-results .alert')).toContainText('Close dialog');
  });

  test('should click button with aria-label "Edit item"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Edit item"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click button with aria-label "Delete item"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Delete item"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click button with aria-label "Add new item"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Add new item"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click button with aria-label "Search"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Search"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click link styled as button', async ({ page, mimic }) => {
    await mimic`click on "Link as Button"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click secondary link button', async ({ page, mimic }) => {
    await mimic`click on "Secondary Link"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click danger link button', async ({ page, mimic }) => {
    await mimic`click on "Danger Link"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should navigate via link button', async ({ page, mimic }) => {
    await mimic`click on "Navigate to Forms"`;

    expect(page.url()).toContain('forms-basic.html');
  });

  test('should click primary button', async ({ page, mimic }) => {
    await mimic`click on "Primary Button"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click secondary button', async ({ page, mimic }) => {
    await mimic`click on "Secondary Button"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click success button', async ({ page, mimic }) => {
    await mimic`click on "Success Button"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click danger button', async ({ page, mimic }) => {
    await mimic`click on "Danger Button"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click button with data-testid', async ({ page, mimic }) => {
    await mimic`click on the button with data-testid "submit-action"`;

    await expect(page.locator('#click-results')).toBeVisible();
    await expect(page.locator('#click-results .alert')).toContainText('submit-action');
  });

  test('should click button with data-testid "cancel-action"', async ({ page, mimic }) => {
    await mimic`click on the button with data-testid "cancel-action"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click button with data-testid "delete-action"', async ({ page, mimic }) => {
    await mimic`click on the button with data-testid "delete-action"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should handle multiple buttons with same text', async ({ page, mimic }) => {
    // There are multiple "Save" buttons - should click one of them
    await mimic`click on "Save"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click "Save Draft" button', async ({ page, mimic }) => {
    await mimic`click on "Save Draft"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click "Save and Continue" button', async ({ page, mimic }) => {
    await mimic`click on "Save and Continue"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should click "Save and Exit" button', async ({ page, mimic }) => {
    await mimic`click on "Save and Exit"`;

    await expect(page.locator('#click-results')).toBeVisible();
  });

  test('should verify disabled buttons are not clickable', async ({ page }) => {
    const disabledButton = page.locator('button:disabled').first();
    await expect(disabledButton).toBeDisabled();
  });

  test('should click multiple different buttons', async ({ page, mimic }) => {
    await mimic`
      click on "Click Me"
      click on "Submit"
      click on "Cancel"
    `;

    const alerts = page.locator('#click-results .alert');
    await expect(alerts).toHaveCount(3);
  });
});
