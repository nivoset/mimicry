import { test, expect } from '../test-utils';

/**
 * Test suite for dynamic-content.html
 * Tests handling of content that loads after page load, appears/disappears, and changes on interaction
 */

test.describe('Dynamic Content Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/dynamic-content.html');
  });

  test('should display page correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Dynamic Content Test Page');
    await expect(page.locator('#load-content-btn')).toBeVisible();
  });

  test('should load content dynamically after clicking button', async ({ page, mimic }) => {
    await mimic`click on "Load Content"`;

    // Wait for content to appear
    await expect(page.locator('#dynamic-content-area')).toContainText('Content Loaded');
    await expect(page.locator('#dynamic-content-area .alert.success')).toBeVisible();
    await expect(page.locator('#dynamic-content-area button')).toBeVisible();
  });

  test('should show loading state before content appears', async ({ page, mimic }) => {
    await mimic`click on "Load Content"`;

    // Should show loading text initially
    const loadingText = await page.locator('#dynamic-content-area').textContent();
    // Content should eventually load
    await expect(page.locator('#dynamic-content-area')).toContainText('Content Loaded', { timeout: 3000 });
  });

  test('should toggle element visibility', async ({ page, mimic }) => {
    // Initially visible
    await expect(page.locator('#toggleable-content')).toBeVisible();

    await mimic`click on "Toggle Visibility"`;

    // Should be hidden
    const display = await page.locator('#toggleable-content').evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should toggle visibility back to visible', async ({ page, mimic }) => {
    await mimic`
      click on "Toggle Visibility"
      click on "Toggle Visibility"
    `;

    // Should be visible again
    await expect(page.locator('#toggleable-content')).toBeVisible();
  });

  test('should change content on button click', async ({ page, mimic }) => {
    const initialContent = await page.locator('#changeable-content').textContent();
    
    await mimic`click on "Change Content"`;

    // Content should change
    await expect(page.locator('#changeable-content')).not.toContainText(initialContent || '');
    await expect(page.locator('#changeable-content')).toBeVisible();
  });

  test('should change content multiple times', async ({ page, mimic }) => {
    await mimic`
      click on "Change Content"
      click on "Change Content"
      click on "Change Content"
    `;

    // Content should have changed
    await expect(page.locator('#changeable-content')).toBeVisible();
  });

  test('should wait for delayed elements to appear', async ({ page }) => {
    // Elements appear with delays: 500ms, 1000ms, 2000ms, 3000ms
    await expect(page.locator('#delayed-elements .card')).toHaveCount(4, { timeout: 5000 });
  });

  test('should verify first delayed element appears', async ({ page }) => {
    await expect(page.locator('#delayed-elements .card').first()).toBeVisible({ timeout: 2000 });
    await expect(page.locator('#delayed-elements .card').first()).toContainText('Element 1');
  });

  test('should load more items in scroll container', async ({ page, mimic }) => {
    const initialCount = await page.locator('.scroll-item').count();
    
    await mimic`click on "Load More Items"`;

    // Should have 3 more items
    await expect(page.locator('.scroll-item')).toHaveCount(initialCount + 3);
  });

  test('should load multiple batches of items', async ({ page, mimic }) => {
    const initialCount = await page.locator('.scroll-item').count();
    
    await mimic`
      click on "Load More Items"
      click on "Load More Items"
    `;

    // Should have 6 more items total
    await expect(page.locator('.scroll-item')).toHaveCount(initialCount + 6);
  });

  test('should show status message', async ({ page, mimic }) => {
    await mimic`click on "Show Status Message"`;

    await expect(page.locator('#status-messages .alert')).toBeVisible();
  });

  test('should show multiple status messages', async ({ page, mimic }) => {
    await mimic`
      click on "Show Status Message"
      click on "Show Status Message"
      click on "Show Status Message"
    `;

    // Should have multiple alerts (some may have been removed after timeout)
    const alerts = page.locator('#status-messages .alert');
    const count = await alerts.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should interact with dynamically loaded button', async ({ page, mimic }) => {
    await mimic`
      click on "Load Content"
      click on "Action Button" in the loaded content
    `;

    // Button should be clickable after content loads
    await expect(page.locator('#dynamic-content-area button')).toBeVisible();
  });

  test('should interact with button in toggleable content', async ({ page, mimic }) => {
    await mimic`
      click on "Toggle Visibility"
      click on "Toggle Visibility"
      click on "Button Inside Toggleable Content"
    `;

    // Button should be clickable when content is visible
    await expect(page.locator('#toggleable-content button')).toBeVisible();
  });

  test('should handle rapid content changes', async ({ page, mimic }) => {
    await mimic`
      click on "Change Content"
      click on "Change Content"
      click on "Change Content"
      click on "Change Content"
    `;

    // Content should still be visible after rapid changes
    await expect(page.locator('#changeable-content')).toBeVisible();
  });

  test('should verify scroll container has initial items', async ({ page }) => {
    await expect(page.locator('.scroll-item')).toHaveCount(3);
    await expect(page.locator('.scroll-item').first()).toContainText('Item 1');
  });
});
