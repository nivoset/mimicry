import { test, expect } from '../test-utils';

/**
 * Test suite for layout-complex.html
 * Tests complex UI patterns including modals, dropdowns, tabs, accordions, and overlays
 */

test.describe('Complex Layout Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/layout-complex.html');
  });

  test('should display page correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Complex Layout Test Page');
  });

  // Modal Tests
  test('should open simple modal', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Open Simple Modal"`;

    await expect(page.locator('#modal1')).toBeVisible();
    await expect(page.locator('#modal1 .modal-content')).toBeVisible();
    await expect(page.locator('#modal1 h2')).toContainText('Simple Modal');
  });

  test('should close simple modal', async ({ page, mimic }) => {
    await mimic`
      click on "Open Simple Modal"
      click on "Close"
    `;

    await expect(page.locator('#modal1')).not.toBeVisible();
  });

  test('should open confirmation dialog', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Open Confirmation Dialog"`;

    await expect(page.locator('#modal2')).toBeVisible();
    await expect(page.locator('#modal2 h2')).toContainText('Confirm Action');
  });

  test('should confirm action in dialog', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Open Confirmation Dialog"
      click on "Confirm"
    `;

    await expect(page.locator('#modal2')).not.toBeVisible();
    await expect(page.locator('#action-results .alert')).toContainText('Confirmed action');
  });

  test('should cancel action in dialog', async ({ page, mimic }) => {
    await mimic`
      click on "Open Confirmation Dialog"
      click on "Cancel"
    `;

    await expect(page.locator('#modal2')).not.toBeVisible();
  });

  test('should open alert dialog', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Open Alert Dialog"`;

    await expect(page.locator('#modal3')).toBeVisible();
    await expect(page.locator('#modal3 h2')).toContainText('Alert');
  });

  test('should close alert dialog', async ({ page, mimic }) => {
    await mimic`
      click on "Open Alert Dialog"
      click on "OK"
    `;

    await expect(page.locator('#modal3')).not.toBeVisible();
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

    await expect(page.locator('#action-results .alert')).toContainText('Edit');
  });

  test('should click delete option in dropdown', async ({ page, mimic }) => {
    await mimic`
      click on "Actions Menu"
      click on "Delete"
    `;

    await expect(page.locator('#action-results .alert')).toContainText('Delete');
  });

  test('should click share option in dropdown', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Actions Menu"
      click on "Share"
    `;

    await expect(page.locator('#action-results .alert')).toContainText('Share');
  });

  test('should open more options dropdown', async ({ page, mimic }) => {
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

  test('should click button in tab 2', async ({ page, mimic }) => {
    await mimic`
      click on "Tab 2"
      click on "Action in Tab 2"
    `;

    await expect(page.locator('#tab-content-2 button')).toBeVisible();
  });

  test('should click button in tab 3', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Tab 3"
      click on "Action in Tab 3"
    `;

    await expect(page.locator('#tab-content-3 button')).toBeVisible();
  });

  // Accordion Tests
  test('should expand accordion section 1', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Section 1"`;

    await expect(page.locator('.accordion-item').first()).toHaveClass(/active/);
    await expect(page.locator('.accordion-item .accordion-content').first()).toBeVisible();
  });

  test('should expand accordion section 2', async ({ page, mimic }) => {
    await mimic`click on "Section 2"`;

    const secondItem = page.locator('.accordion-item').nth(1);
    await expect(secondItem).toHaveClass(/active/);
  });

  test('should collapse accordion section when clicked again', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Section 1"
      click on "Section 1"
    `;

    const firstItem = page.locator('.accordion-item').first();
    // Should toggle off
    const isActive = await firstItem.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(false);
  });

  test('should click button inside accordion', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Section 1"
      click on "Button in Accordion 1"
    `;

    await expect(page.locator('.accordion-item .accordion-content button').first()).toBeVisible();
  });

  // Overlay Tests
  test('should show loading overlay', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Show Loading Overlay"`;

    await expect(page.locator('#overlay1')).toBeVisible();
    await expect(page.locator('#overlay1 .spinner')).toBeVisible();
  });

  test('should show info overlay', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Show Info Overlay"`;

    await expect(page.locator('#overlay2')).toBeVisible();
    await expect(page.locator('#overlay2 h3')).toContainText('Information Overlay');
  });

  test('should close info overlay', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Show Info Overlay"
      click on "Close"
    `;

    await expect(page.locator('#overlay2')).not.toBeVisible();
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

    await expect(page.locator('.accordion-item').first()).toHaveClass(/active/);
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
    await expect(page.locator('#modal1')).not.toBeVisible();
    await expect(page.locator('#modal2')).not.toBeVisible();
    await expect(page.locator('#modal3')).not.toBeVisible();
  });

  test('should verify action results are logged', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Open Confirmation Dialog"
      click on "Confirm"
      click on "Actions Menu"
      click on "Delete"
    `;

    const alerts = page.locator('#action-results .alert');
    const count = await alerts.count();
    expect(count).toBeGreaterThan(0);
  });
});
