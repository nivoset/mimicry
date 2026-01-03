import { test, expect } from '../test-utils';

/**
 * Test suite for accessibility.html
 * Tests accessibility-first selection strategies using aria-labels, roles, semantic HTML, and proper label associations
 */

test.describe('Accessibility Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/accessibility.html');
  });

  test('should display page with semantic structure', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Accessibility Test Page');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('nav[role="navigation"][aria-label="Main navigation"]')).toBeVisible();
  });

  test('should click button with aria-label "Close this dialog"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Close this dialog"`;

    // Button should be clickable
    const button = page.locator('button[aria-label="Close this dialog"]');
    await expect(button).toBeVisible();
  });

  test('should click button with aria-label "Save the current document"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Save the current document"`;

    const button = page.locator('button[aria-label="Save the current document"]');
    await expect(button).toBeVisible();
  });

  test('should click button with aria-label "Print the current page"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Print the current page"`;

    const button = page.locator('button[aria-label="Print the current page"]');
    await expect(button).toBeVisible();
  });

  test('should click button with aria-label "Search for items"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Search for items"`;

    const button = page.locator('button[aria-label="Search for items"]');
    await expect(button).toBeVisible();
  });

  test('should click button with aria-label "Add a new item to the list"', async ({ page, mimic }) => {
    await mimic`click on the button with aria-label "Add a new item to the list"`;

    const button = page.locator('button[aria-label="Add a new item to the list"]');
    await expect(button).toBeVisible();
  });

  test('should interact with article element', async ({ page }) => {
    await expect(page.locator('article')).toBeVisible();
    await expect(page.locator('article h3')).toContainText('Article Title');
  });

  test('should interact with aside element', async ({ page }) => {
    await expect(page.locator('aside[role="complementary"]')).toBeVisible();
    await expect(page.locator('aside h3')).toContainText('Related Information');
  });

  test('should click button inside article', async ({ page, mimic }) => {
    await mimic`click on "Read More" in the article`;

    const button = page.locator('article button');
    await expect(button).toBeVisible();
  });

  test('should fill username field using label association', async ({ page, mimic }) => {
    await mimic`type "testuser" into the username field`;

    await expect(page.locator('#username-field')).toHaveValue('testuser');
  });

  test('should fill password field using label association', async ({ page, mimic }) => {
    await mimic`type "password123" into the password field`;

    await expect(page.locator('#password-field')).toHaveValue('password123');
  });

  test('should check remember me checkbox', async ({ page, mimic }) => {
    await mimic`check the remember me checkbox`;

    await expect(page.locator('input[name="remember"]')).toBeChecked();
  });

  test('should submit login form', async ({ page, mimic }) => {
    await mimic`
      type "user@example.com" into the username field
      type "securepass" into the password field
      check the remember me checkbox
      click on "Login"
    `;

    const loginButton = page.locator('button[aria-label="Submit the login form"]');
    await expect(loginButton).toBeVisible();
  });

  test('should interact with custom button with role', async ({ page, mimic }) => {
    await mimic`click on "Custom Button"`;

    const customButton = page.locator('[role="button"]').first();
    await expect(customButton).toBeVisible();
  });

  test('should interact with custom link with role', async ({ page, mimic }) => {
    await mimic`click on "Custom Link"`;

    const customLink = page.locator('[role="link"]').first();
    await expect(customLink).toBeVisible();
  });

  test('should verify alert role element', async ({ page }) => {
    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.locator('[role="alert"]')).toContainText('This is an alert message');
  });

  test('should verify status role element', async ({ page }) => {
    await expect(page.locator('[role="status"]').first()).toBeVisible();
    await expect(page.locator('[role="status"]').first()).toContainText('All systems operational');
  });

  test('should navigate via secondary navigation', async ({ page }) => {
    await expect(page.locator('nav[aria-label="Secondary navigation"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="Secondary navigation"] a')).toHaveCount(3);
  });

  test('should interact with search form', async ({ page, mimic }) => {
    await mimic`
      type "test query" into the search input
      click on "Search"
    `;

    const searchForm = page.locator('form[role="search"]');
    await expect(searchForm).toBeVisible();
  });

  test('should update live region', async ({ page, mimic }) => {
    const initialStatus = await page.locator('#live-status').textContent();
    
    await mimic`click on "Update Live Region"`;

    // Status should change
    await expect(page.locator('#live-status')).not.toContainText(initialStatus || '');
  });

  test('should update live region multiple times', async ({ page, mimic }) => {
    await mimic`
      click on "Update Live Region"
      click on "Update Live Region"
      click on "Update Live Region"
    `;

    await expect(page.locator('#live-status')).toBeVisible();
  });

  test('should interact with button with aria-describedby', async ({ page, mimic }) => {
    await mimic`click on "Delete"`;

    const deleteButton = page.locator('button[aria-describedby="delete-description"]');
    await expect(deleteButton).toBeVisible();
    await expect(page.locator('#delete-description')).toContainText('cannot be undone');
  });

  test('should interact with button with save description', async ({ page, mimic }) => {
    await mimic`click on "Save"`;

    const saveButton = page.locator('button[aria-describedby="save-description"]');
    await expect(saveButton).toBeVisible();
    await expect(page.locator('#save-description')).toContainText('Saves your changes');
  });

  test('should verify footer has contentinfo role', async ({ page }) => {
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });

  test('should verify main has main role', async ({ page }) => {
    await expect(page.locator('main[role="main"]')).toBeVisible();
  });

  test('should fill complete form using accessibility features', async ({ page, mimic }) => {
    await mimic`
      type "accessibility@test.com" into the username field
      type "testpass123" into the password field
      check the remember me checkbox
      click on the button with aria-label "Submit the login form"
    `;

    await expect(page.locator('#username-field')).toHaveValue('accessibility@test.com');
    await expect(page.locator('#password-field')).toHaveValue('testpass123');
  });
});
