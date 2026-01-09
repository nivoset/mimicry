import { test, expect } from '../test-utils';

/**
 * Test suite for forms-complex.html
 * Tests multi-step forms, conditional fields, validation, and file uploads
 */

test.describe('Complex Forms Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/forms-complex.html');
  });

  test('should display step 1 by default', async ({ page }) => {
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-1')).toHaveClass(/active/);
    await expect(page.locator('#current-step')).toContainText('1');
  });

  test('should fill step 1 and navigate to step 2', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      type "Alice" into the first name field
      type "Johnson" into the last name field
      select "Personal" from the account type dropdown
      click on "Next Step"
    `;

    await expect(page.locator('#step-2')).toBeVisible();
    await expect(page.locator('#step-1')).not.toBeVisible();
    await expect(page.locator('#current-step')).toContainText('2');
  });

  test('should show business fields when business account type is selected', async ({ page, mimic }) => {
    await mimic`select "Business" from the account type dropdown`;

    await expect(page.locator('#business-fields')).toBeVisible();
    await expect(page.locator('#company-name')).toBeVisible();
  });

  test('should show organization fields when organization account type is selected', async ({ page, mimic }) => {
    await mimic`select "Organization" from the account type dropdown`;

    await expect(page.locator('#organization-fields')).toBeVisible();
    await expect(page.locator('#org-name')).toBeVisible();
    await expect(page.locator('#tax-id')).toBeVisible();
  });

  test('should hide business fields when switching to personal', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      select "Business" from the account type dropdown
      select "Personal" from the account type dropdown
    `;

    await expect(page.locator('#business-fields')).not.toBeVisible();
  });

  test('should fill business fields and proceed', async ({ page, mimic }) => {
    await mimic`
      type "Business User" into the first name field
      type "Corp" into the last name field
      select "Business" from the account type dropdown
      type "Test Company Inc" into the company name field
      click on "Next Step"
    `;

    await expect(page.locator('#step-2')).toBeVisible();
  });

  test('should fill step 2 and navigate to step 3', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      type "Bob" into the first name field
      type "Smith" into the last name field
      click on "Next Step"
      type "bob@example.com" into the email field
      type "5551234567" into the phone field
      click on "Next Step"
    `;

    await expect(page.locator('#step-3')).toBeVisible();
    await expect(page.locator('#current-step')).toContainText('3');
  });

  test('should show SMS fields when SMS contact method is selected', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      click on "Next Step"
      select "SMS" from the preferred contact method dropdown
    `;

    await expect(page.locator('#sms-fields')).toBeVisible();
    await expect(page.locator('#sms-number')).toBeVisible();
  });

  test('should show mail fields when postal mail is selected', async ({ page, mimic }) => {
    await mimic`
      click on "Next Step"
      select "Postal Mail" from the preferred contact method dropdown
    `;

    await expect(page.locator('#mail-fields')).toBeVisible();
    await expect(page.locator('#address')).toBeVisible();
    await expect(page.locator('#city')).toBeVisible();
    await expect(page.locator('#zip')).toBeVisible();
  });

  test('should navigate back to previous step', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      type "Test" into the first name field
      click on "Next Step"
      click on "Previous"
    `;

    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-2')).not.toBeVisible();
    await expect(page.locator('#current-step')).toContainText('1');
  });

  test('should update progress bar as steps progress', async ({ page, mimic }) => {
    const progress1 = await page.locator('#progress-fill').evaluate(el => (el as HTMLElement).style.width);
    expect(progress1).toBe('33.33%');

    await mimic`
      type "User" into the first name field
      click on "Next Step"
    `;

    const progress2 = await page.locator('#progress-fill').evaluate(el => (el as HTMLElement).style.width);
    expect(progress2).toBe('66.66%');

    await mimic`
      type "user@example.com" into the email field
      click on "Next Step"
    `;

    const progress3 = await page.locator('#progress-fill').evaluate(el => (el as HTMLElement).style.width);
    expect(progress3).toBe('100%');
  });

  test('should fill step 3 with all fields', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      type "Charlie" into the first name field
      type "Brown" into the last name field
      click on "Next Step"
      type "charlie@example.com" into the email field
      click on "Next Step"
      type "I love testing forms" into the biography field
      check "Technology"
      check "Music"
      check the newsletter checkbox
      check the terms and conditions checkbox
    `;

    await expect(page.locator('#bio')).toHaveValue('I love testing forms');
    await expect(page.locator('input[value="technology"]')).toBeChecked();
    await expect(page.locator('input[value="music"]')).toBeChecked();
  });

  test('should complete entire form flow', async ({ page, mimic }) => {
    await mimic`
      type "Complete" into the first name field
      type "Form" into the last name field
      select "Personal" from the account type dropdown
      click on "Next Step"
      type "complete@test.com" into the email field
      type "5551112222" into the phone field
      click on "Next Step"
      type "Test biography" into the biography field
      check "Travel"
      check the newsletter checkbox
      check the terms and conditions checkbox
      click on "Submit Form"
    `;

    await expect(page.locator('#form-result')).toBeVisible();
    const formData = await page.locator('#form-data').textContent();
    expect(formData).toContain('Complete');
    expect(formData).toContain('Form');
    expect(formData).toContain('complete@test.com');
  });

  test('should handle file upload field', { tag: ['@mimic'] }, async ({ page, mimic }) => {
    await mimic`
      type "File" into the first name field
      type "Test" into the last name field
      click on "Next Step"
      type "file@test.com" into the email field
      click on "Next Step"
    `;

    await expect(page.locator('#file-upload')).toBeVisible();
    // File upload would require actual file, but we can verify the field exists
  });
});
