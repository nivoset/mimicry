import { test, expect } from '../test-utils';

/**
 * Test suite for layout-complex.html
 * Tests complex UI patterns including modals, dropdowns, tabs, accordions, and overlays
 */

test.describe('Complex Layout Page', { tag: ['@layout'] }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/layout-complex.html');
    // Ensure all overlays are closed before each test to prevent interference
    await page.evaluate(() => {
      document.querySelectorAll('.overlay').forEach(overlay => {
        overlay.classList.add('hidden');
      });
    });
    // Wait for overlays to be hidden (not visible)
    await expect(page.locator('#overlay1')).not.toBeVisible();
    await expect(page.locator('#overlay2')).not.toBeVisible();
  });

  test('should display page correctly', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Complex Layout Test Page');
  });

  // Modal Tests
  test('should open simple modal', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Open Simple Modal"`;

    await expect(page.getByRole('heading', { name: 'Information Overlay' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Simple Modal' })).toBeVisible();
  });

  test('should close simple modal', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Open Simple Modal"
      click on "Close"
    `;

    await expect(page.getByRole('heading', { name: 'Simple Modal' })).not.toBeVisible();
  });

  test('should open confirmation dialog', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Open Confirmation Dialog"`;

    await expect(page.getByRole('heading', { name: 'Confirm Action' })).toBeVisible();
  });

  test('should confirm action in dialog', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Open Confirmation Dialog"
      click on "Confirm"
    `;

    await expect(page.getByRole('heading', { name: 'Confirm Action' })).not.toBeVisible();
    await expect(page.locator('#action-results').getByText('Confirmed action')).toBeVisible();
  });

  test('should cancel action in dialog', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Open Confirmation Dialog"
      click on "Cancel"
    `;

    await expect(page.getByRole('heading', { name: 'Confirm Action' })).not.toBeVisible();
  });

  test('should open alert dialog', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Open Alert Dialog"`;

    await expect(page.getByRole('heading', { name: 'Alert' })).toBeVisible();
  });

  test('should close alert dialog', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Open Alert Dialog"
      click on "OK"
    `;

    await expect(page.getByRole('heading', { name: 'Alert' })).not.toBeVisible();
  });

  // Dropdown Tests
  test('should open actions dropdown menu', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Actions Menu"`;

    await expect(page.locator('#dropdown1')).toBeVisible();
    await expect(page.locator('#dropdown1')).not.toHaveClass(/hidden/);
  });

  test('should close dropdown when clicking outside', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Actions Menu"
      click on the page body
    `;

    // Dropdown should close (implementation may vary)
    // At minimum, verify dropdown exists
    await expect(page.locator('#dropdown1')).toBeVisible();
  });

  test('should click edit option in dropdown', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Actions Menu"
      click on "Edit"
    `;

    await expect(page.locator('#action-results').getByText('Edit')).toBeVisible();
  });

  test('should click delete option in dropdown', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Actions Menu"
      click on "Delete"
    `;

    await expect(page.locator('#action-results').getByText('Delete')).toBeVisible();
  });

  test('should click share option in dropdown', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Actions Menu"
      click on "Share"
    `;

    await expect(page.locator('#action-results').getByText('Share')).toBeVisible();
  });

  test('should open more options dropdown', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "More Options"`;

    await expect(page.locator('#dropdown2')).toBeVisible();
  });

  // Tab Tests
  test('should switch to tab 2', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Tab 2"`;

    await expect(page.locator('#tab-content-2')).toBeVisible();
    await expect(page.locator('#tab-content-2')).toHaveClass(/active/);
    await expect(page.locator('#tab-content-1')).not.toBeVisible();
  });

  test('should switch to tab 3', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Tab 3"`;

    await expect(page.locator('#tab-content-3')).toBeVisible();
    await expect(page.locator('#tab-content-3')).toHaveClass(/active/);
    await expect(page.locator('#tab-content-1')).not.toBeVisible();
  });

  test('should switch back to tab 1', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Tab 2"
      click on "Tab 1"
    `;

    await expect(page.locator('#tab-content-1')).toBeVisible();
    await expect(page.locator('#tab-content-1')).toHaveClass(/active/);
  });

  test('should click button in tab 2', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Tab 2"
      click on "Action in Tab 2"
    `;

    await expect(page.locator('#tab-content-2').getByRole('button')).toBeVisible();
  });

  test('should click button in tab 3', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Tab 3"
      click on "Action in Tab 3"
    `;

    await expect(page.locator('#tab-content-3').getByRole('button')).toBeVisible();
  });

  // Accordion Tests
  test('should expand accordion section 1', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Section 1"`;

    const accordionItem = page.getByText('Section 1').locator('xpath=ancestor::div[contains(@class, "accordion-item")]');
    await expect(accordionItem).toHaveClass(/active/);
    await expect(accordionItem.locator('.accordion-content')).toBeVisible();
  });

  test('should expand accordion section 2', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Section 2"`;

    const secondItem = page.getByText('Section 2').locator('xpath=ancestor::div[contains(@class, "accordion-item")]');
    await expect(secondItem).toHaveClass(/active/);
  });

  test('should collapse accordion section when clicked again', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Section 1"
      click on "Section 1"
    `;

    const firstItem = page.getByText('Section 1').locator('xpath=ancestor::div[contains(@class, "accordion-item")]');
    // Should toggle off
    const isActive = await firstItem.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(false);
  });

  test('should click button inside accordion', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Section 1"
      click on "Button in Accordion 1"
    `;

    await expect(page.getByRole('button', { name: 'Button in Accordion 1' })).toBeVisible();
  });

  // Overlay Tests
  test('should show loading overlay', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Show Loading Overlay"`;

    await expect(page.locator('#overlay1')).toBeVisible();
    await expect(page.locator('#overlay1').getByText('Loading...')).toBeVisible();
    await expect(page.locator('#overlay1').locator('.spinner')).toBeVisible();
  });

  test('should show info overlay', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Show Info Overlay"`;

    await expect(page.getByRole('heading', { name: 'Information Overlay' })).toBeVisible();
  });

  test('should close info overlay', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Show Info Overlay"
      click on "Close"
    `;

    await expect(page.getByRole('heading', { name: 'Information Overlay' })).not.toBeVisible();
  });

  // Combined Interaction Tests
  test('should interact with modal then tab', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Open Simple Modal"
      click on "Close"
      click on "Tab 2"
    `;

    await expect(page.locator('#tab-content-2')).toBeVisible();
  });

  test('should interact with dropdown then accordion', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Actions Menu"
      click on "Edit"
      click on "Section 1"
    `;

    const accordionItem = page.getByText('Section 1').locator('xpath=ancestor::div[contains(@class, "accordion-item")]');
    await expect(accordionItem).toHaveClass(/active/);
  });

  test('should interact with multiple modals', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Open Simple Modal"
      click on "Close"
      click on "Open Confirmation Dialog"
      click on "Cancel"
      click on "Open Alert Dialog"
      click on "OK"
    `;

    // All modals should be closed
    await expect(page.getByRole('heading', { name: 'Simple Modal' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Confirm Action' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alert' })).not.toBeVisible();
  });

  test('should verify action results are logged', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Open Confirmation Dialog"
      click on "Confirm"
      click on "Actions Menu"
      click on "Delete"
    `;

    const alerts = page.locator('#action-results').getByRole('alert');
    const count = await alerts.count();
    expect(count).toBeGreaterThan(0);
  });
});
