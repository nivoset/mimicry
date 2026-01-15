import { test, expect } from '../test-utils';

/**
 * Test suite for forms-basic.html
 * Tests basic form interactions including text inputs, selects, checkboxes, and radio buttons
 */

test.describe('Basic Forms Page', { tag: ['@form-simple'] }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/forms-basic.html');
  });

  test('should display form correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Basic Forms Test Page');
    await expect(page.locator('#basic-form')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
  });

  test('should fill out name field', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`type "John Doe" into the name field`;

    await expect(page.locator('#name')).toHaveValue('John Doe');
  });

  test('should fill out email field', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`type "john@example.com" into the email field`;

    await expect(page.locator('#email')).toHaveValue('john@example.com');
  });

  test('should fill out phone field', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`type "5551234567" into the phone field`;

    await expect(page.locator('#phone')).toHaveValue('5551234567');
  });

  test('should select country from dropdown', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`select "United States" from the country dropdown`;

    await expect(page.locator('#country')).toHaveValue('us');
  });

  test('should select different country', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`select "Canada" from the country dropdown`;

    await expect(page.locator('#country')).toHaveValue('ca');
  });

  test('should fill out message textarea', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    const message = 'This is a test message for the form.';
    await mimic`type "${message}" into the message field`;

    await expect(page.locator('#message')).toHaveValue(message);
  });

  test('should select radio button option', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`check the "Phone" radio button`;

    await expect(page.locator('input[value="phone"]')).toBeChecked();
  });

  test('should change radio button selection', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      check the "SMS" radio button
    `;

    await expect(page.locator('input[value="sms"]')).toBeChecked();
    await expect(page.locator('input[value="email"]')).not.toBeChecked();
  });

  test('should check newsletter checkbox', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`check "Daily Newsletter"`;

    await expect(page.locator('input[value="daily"]')).toBeChecked();
  });

  test('should check multiple newsletter checkboxes', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      select "Daily Newsletter"
      and select "Weekly Digest"
      and select "Promotional Emails"
    `;

    await expect(page.locator('input[value="daily"]')).toBeChecked();
    await expect(page.locator('input[value="weekly"]')).toBeChecked();
    await expect(page.locator('input[value="promotions"]')).toBeChecked();
  });

  test('should check terms and conditions checkbox', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`check the terms and conditions checkbox`;

    await expect(page.locator('input[name="terms"]')).toBeChecked();
  });

  test('should submit complete form', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      type "Jane Smith" into the name field
      type "jane@example.com" into the email field
      type "5559876543" into the phone field
      select "United Kingdom" from the country dropdown
      type "Hello, this is a test message" into the message field
      select the "Phone" radio button
      select "Weekly Digest"
      select the terms and conditions checkbox
      click on "Submit Form"
    `;

    // Verify form was submitted
    await expect(page.locator('#form-result')).toBeVisible();
    await expect(page.locator('#form-data')).toContainText('Jane Smith');
    await expect(page.locator('#form-data')).toContainText('jane@example.com');
    await expect(page.locator('#form-data')).toContainText('uk');
  });

  test('should reset form', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      type "Test Name" into the name field
      type "test@example.com" into the email field
      select "Australia" from the country dropdown
      check "Daily Newsletter"
      click on "Reset Form"
    `;

    await expect(page.locator('#name')).toHaveValue('');
    await expect(page.locator('#email')).toHaveValue('');
    await expect(page.locator('#country')).toHaveValue('');
    await expect(page.locator('input[value="daily"]')).not.toBeChecked();
  });

  test('should validate required fields on submit', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`click on "Submit Form" without filling required fields`;

    // Form should show validation (browser native validation)
    const nameField = page.locator('#name');
    const isRequired = await nameField.evaluate((el: HTMLInputElement) => el.validity.valueMissing);
    expect(isRequired).toBe(true);
  });

  test('should fill form with all field types', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      type "Complete Test User" into the name field
      type "complete@test.com" into the email field
      type "1234567890" into the phone field
      select "Germany" from the country dropdown
      type "This is a comprehensive test of all form fields" into the message field
      check the "SMS" radio button
      check "Daily Newsletter"
      check "Weekly Digest"
      check "Promotional Emails"
      check the terms and conditions checkbox
      click on "Submit Form"
    `;

    await expect(page.locator('#form-result')).toBeVisible();
    const formData = await page.locator('#form-data').textContent();
    expect(formData).toContain('Complete Test User');
    expect(formData).toContain('complete@test.com');
    expect(formData).toContain('de');
    expect(formData).toContain('sms');
  });
});
