import { test, expect } from '../test-utils';

/**
 * Test suite for simple-navigation.html
 * Tests basic navigation scenarios including links, URL parameters, and browser history
 */

test.describe('Simple Navigation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/simple-navigation.html');
  });

  test('should display navigation page correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Simple Navigation Test Page');
    await expect(page.locator('nav')).toBeVisible();
  });

  test('should navigate to forms page via internal link', async ({ page, mimic }) => {
    await mimic`click on "Go to Forms Page"`;

    expect(page.url()).toContain('forms-basic.html');
    await expect(page.locator('h1')).toContainText('Basic Forms');
  });

  test('should navigate to buttons page via internal link', async ({ page, mimic }) => {
    await mimic`click on "Go to Buttons Page"`;

    expect(page.url()).toContain('buttons-variety.html');
    await expect(page.locator('h1')).toContainText('Button Variety');
  });

  test('should navigate to dynamic content page', async ({ page, mimic }) => {
    await mimic`click on "Go to Dynamic Content Page"`;

    expect(page.url()).toContain('dynamic-content.html');
  });

  test('should navigate to accessibility page', async ({ page, mimic }) => {
    await mimic`click on "Go to Accessibility Page"`;

    expect(page.url()).toContain('accessibility.html');
  });

  test('should navigate with URL parameters', async ({ page, mimic }) => {
    await mimic`click on "Page 1, Section Test"`;

    expect(page.url()).toContain('page=1');
    expect(page.url()).toContain('section=test');
    await expect(page.locator('#url-params')).toContainText('page=1');
  });

  test('should navigate with different URL parameters', async ({ page, mimic }) => {
    await mimic`click on "Page 2, Filter Active"`;

    expect(page.url()).toContain('page=2');
    expect(page.url()).toContain('filter=active');
  });

  test('should navigate with tab and view parameters', async ({ page, mimic }) => {
    await mimic`click on "Settings Tab, List View"`;

    expect(page.url()).toContain('tab=settings');
    expect(page.url()).toContain('view=list');
  });

  test('should go back in browser history', async ({ page, mimic }) => {
    await mimic`
      click on "Go to Forms Page"
      go back
    `;

    expect(page.url()).toContain('simple-navigation.html');
  });

  test('should go forward in browser history', async ({ page, mimic }) => {
    await mimic`
      click on "Go to Buttons Page"
      go back
      go forward
    `;

    expect(page.url()).toContain('buttons-variety.html');
  });

  test('should refresh the page', async ({ page, mimic }) => {
    const initialUrl = page.url();
    
    await mimic`click on "Refresh Page"`;

    // After refresh, should still be on the same page
    expect(page.url()).toContain('simple-navigation.html');
  });

  test('should display current URL information', async ({ page }) => {
    await expect(page.locator('#current-url')).toBeVisible();
    await expect(page.locator('#url-params')).toBeVisible();
    
    const urlText = await page.locator('#current-url').textContent();
    expect(urlText).toContain('simple-navigation.html');
  });

  test('should display URL parameters when present', async ({ page, mimic }) => {
    await mimic`click on "Page 1, Section Test"`;

    await expect(page.locator('#url-params')).toContainText('page=1');
    await expect(page.locator('#url-params')).toContainText('section=test');
  });

  test('should navigate via navigation menu', async ({ page, mimic }) => {
    await mimic`click on "Forms" in the navigation menu`;

    expect(page.url()).toContain('forms-basic.html');
  });

  test('should navigate to home page from navigation', async ({ page, mimic }) => {
    await mimic`click on "Home" in the navigation menu`;

    expect(page.url()).toContain('index.html');
  });
});
