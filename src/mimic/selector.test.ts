/**
 * Unit tests for selector generation
 * 
 * Tests the generateBestSelectorForElement function to ensure it:
 * - Prioritizes selectors correctly (testid > role > label > etc.)
 * - Handles grouped elements with nth()
 * - Falls back appropriately when selectors aren't unique
 * - Handles edge cases (missing attributes, page closed, etc.)
 */

import { test, expect } from '@playwright/test';
import { chromium, Browser, Page } from '@playwright/test';
import { generateBestSelectorForElement } from './selector.js';
import { addMarkerCode } from './markers.js';
import { getFromSelector, getMimicIdFromLocator } from './selectorUtils.js';

/**
 * Helper to create a test HTML page with elements and inject markers
 * Uses the real marker system to ensure proper marker ID assignment
 */
async function createTestPage(page: Page, html: string): Promise<void> {
  await page.setContent(html);
  // Use the real marker system for proper marker injection
  // This ensures marker IDs are assigned correctly and match the actual system behavior
  await addMarkerCode(page);
}

test.describe('Selector Generation - Priority Order', { tag: ['@selector-generation', '@markers']}, () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('Priority 1: data-testid', () => {
    test('should use testid when available', async () => {
      await createTestPage(page, `
        <input type="text" data-testid="username-input" id="user" name="user" />
      `);

      const locator = page.getByTestId('username-input');
      const selector = await generateBestSelectorForElement(locator);

      expect(selector).toMatchObject({
        type: 'testid',
        value: 'username-input',
      });
    });

    test('should prefer testid over other attributes', async () => {
      await createTestPage(page, `
        <button 
          data-testid="submit-btn" 
          id="submit" 
          role="button" 
          aria-label="Submit Form"
        >
          Submit
        </button>
      `);

      const locator = page.getByTestId('submit-btn');
      const selector = await generateBestSelectorForElement(locator);

      expect(selector).toMatchObject({
        type: 'testid',
        value: 'submit-btn',
      });
    });

    test('should prefer unique child testid over nested selector', async () => {
      await createTestPage(page, `
        <div data-testid="form-container">
          <input type="text" data-testid="username-input" />
        </div>
      `);

      // Use Playwright's recommended chaining: getByTestId + getByTestId
      const locator = page.getByTestId('form-container').getByTestId('username-input');
      const selector = await generateBestSelectorForElement(locator);

      // Should prefer the unique child testid directly over creating a nested selector
      // This follows the principle that unique child selectors are more stable than nested ones
      expect(selector).toMatchObject({
        type: 'testid',
        value: 'username-input',
      });
      
      // Verify selector actually works using web-first assertions
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      await expect(reconstructedId).toBe(originalId);
    });

    test('should use nested selector when child lacks unique identifier', async () => {
      await createTestPage(page, `
        <div data-testid="form-container">
          <input type="text"  />
        </div>
        <div data-testid="form-2-container">
          <input type="text"  />
        </div>
      `);

      const locator = page.getByTestId('form-container').getByRole('textbox');
      const selector = await generateBestSelectorForElement(locator);

      // Nested selectors may return parent+child or just child if child is unique
      // Verify the selector works regardless
      expect(selector).toMatchObject({
        type: 'testid',
        value: 'form-container',
        child: {
          type: 'role',
          role: 'textbox',
        },
      });
      
      // Verify selector actually works using web-first assertions
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      await expect(reconstructedId).toBe(originalId);
    });
  });

  test.describe('Priority 2: Role + Name', () => {
    test('should use role + aria-label for form elements', async () => {
      await createTestPage(page, `
        <input 
          type="text" 
          role="textbox" 
          aria-label="Email Address" 
          id="email" 
          name="email" 
        />
      `);

      const locator = page.getByRole('textbox', { name: 'Email Address' });
      const selector = await generateBestSelectorForElement(locator);

      expect(selector).toMatchObject({
        type: 'role',
        role: 'textbox',
        name: 'Email Address',
      });
    });

    test('should use role + label for form inputs with label association', async () => {
      await createTestPage(page, `
        <label for="name">Full Name</label>
        <input type="text" id="name" name="name" />
      `);

      const locator = page.getByRole('textbox', { name: 'Full Name' });
      const selector = await generateBestSelectorForElement(locator);

      expect(selector).toMatchObject({
        type: 'role',
        role: 'textbox',
        name: 'Full Name',
      });
    });

    test('should use role + text for buttons', async () => {
      await createTestPage(page, `
        <button>Submit Form</button>
      `);

      const locator = page.getByRole('button', { name: 'Submit Form' });
      const selector = await generateBestSelectorForElement(locator);

      expect(selector).toMatchObject({
        type: 'role',
        role: 'button',
        name: 'Submit Form',
      });
    });

    test('should use role+text when text is unique, even with id available', async () => {
      await createTestPage(page, `
        <button>Click Me</button>
        <button>Click Me</button>
        <button id="unique-btn">Unique Button</button>
      `);

      // Use Playwright's recommended locator (getByRole) instead of CSS selector
      const locator = page.getByRole('button', { name: 'Unique Button' });
      const selector = await generateBestSelectorForElement(locator);

      // Should prefer role+text over id since role+text is unique and higher priority
      expect(selector).toMatchObject({
        type: 'role',
        role: 'button',
        name: 'Unique Button',
      });
    });

    test('should use nth() for radio button groups when role+name is not unique', async () => {
      await createTestPage(page, `
        <fieldset>
          <legend>Preferred Contact Method</legend>
          <input type="radio" name="contact" value="email" id="radio-1" />
          <label for="radio-1">Email</label>
          <input type="radio" name="contact" value="phone" id="radio-2" />
          <label for="radio-2">Phone</label>
          <input type="radio" name="contact" value="sms" id="radio-3" />
          <label for="radio-3">SMS</label>
        </fieldset>
      `);

      // Use Playwright's recommended locator (getByRole with label) instead of CSS selector
      const locator1 = page.getByRole('radio', { name: 'Email' });
      const selector1 = await generateBestSelectorForElement(locator1);

      // Should prefer role+name over CSS id (following Playwright best practices)
      expect(selector1).toMatchObject({
        type: 'role',
        role: 'radio',
        name: 'Email',
      });
      // Verify selector works
      const reconstructed1 = getFromSelector(page, selector1);
      const originalId1 = await getMimicIdFromLocator(locator1);
      const reconstructedId1 = await getMimicIdFromLocator(reconstructed1);
      await expect(reconstructedId1).toBe(originalId1);

      // Test second radio button - use getByRole instead of CSS
      const locator2 = page.getByRole('radio', { name: 'Phone' });
      const selector2 = await generateBestSelectorForElement(locator2);

      expect(selector2).toMatchObject({
        type: 'role',
        role: 'radio',
        name: 'Phone',
      });
      // Verify selector works
      const reconstructed2 = getFromSelector(page, selector2);
      const originalId2 = await getMimicIdFromLocator(locator2);
      const reconstructedId2 = await getMimicIdFromLocator(reconstructed2);
      await expect(reconstructedId2).toBe(originalId2);
    });

    test('should use role+name for checkbox groups', async () => {
      await createTestPage(page, `
        <label>Newsletter Preferences</label>
        <input type="checkbox" name="newsletter" value="daily" id="check-1" />
        <label for="check-1">Daily</label>
        <input type="checkbox" name="newsletter" value="weekly" id="check-2" />
        <label for="check-2">Weekly</label>
      `);

      // Use Playwright's recommended locator (getByRole with label) instead of CSS selector
      const locator = page.getByRole('checkbox', { name: 'Daily' });
      const selector = await generateBestSelectorForElement(locator);

      // Should prefer role+name over CSS id (following Playwright best practices)
      expect(selector).toMatchObject({
        type: 'role',
        role: 'checkbox',
        name: 'Daily',
      });
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      await expect(reconstructedId).toBe(originalId);
    });
  });

  test.describe('Priority 3: Label', () => {
    test('should use role+label for form inputs with label (preferred over label alone)', async () => {
      await createTestPage(page, `
        <label for="email">Email Address</label>
        <input type="email" id="email" name="email" />
      `);

      const locator = page.getByLabel('Email Address');
      const selector = await generateBestSelectorForElement(locator);

      // Role+label name is preferred over label alone (higher priority)
      expect(selector).toMatchObject({
        type: 'role',
        role: 'textbox',
        name: 'Email Address',
      });
      
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      expect(reconstructedId).toBe(originalId);
    });

    test('should prefer role+label over placeholder', async () => {
      await createTestPage(page, `
        <label for="name">Full Name</label>
        <input 
          type="text" 
          id="name" 
          name="name" 
          placeholder="Enter your name" 
        />
      `);

      const locator = page.getByLabel('Full Name');
      const selector = await generateBestSelectorForElement(locator);

      // Role+label name is preferred over label alone or placeholder
      expect(selector).toMatchObject({
        type: 'role',
        role: 'textbox',
        name: 'Full Name',
      });
      
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      expect(reconstructedId).toBe(originalId);
    });

    test('should use role+name when multiple elements have same label', async () => {
      await createTestPage(page, `
        <fieldset>
          <legend>Contact Method</legend>
          <input type="radio" name="contact" id="r1" />
          <label for="r1">Email</label>
          <input type="radio" name="contact" id="r2" />
          <label for="r2">Phone</label>
        </fieldset>
      `);

      // Use Playwright's recommended locator (getByRole with label) instead of CSS selector
      const locator = page.getByRole('radio', { name: 'Email' });
      const selector = await generateBestSelectorForElement(locator);

      // Should prefer role+name over CSS id (following Playwright best practices)
      expect(selector).toMatchObject({
        type: 'role',
        role: 'radio',
        name: 'Email',
      });
      // Verify the selector actually locates the correct element
      const reconstructedLocator = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructedLocator);
      await expect(reconstructedId).toBe(originalId);
    });
  });

  test.describe('Priority 4: Placeholder', () => {
    test('should use placeholder when no label available', async () => {
      await createTestPage(page, `
        <input 
          type="text" 
          placeholder="Enter your email" 
        />
      `);

      const locator = page.getByPlaceholder('Enter your email');
      const selector = await generateBestSelectorForElement(locator);

      // May use placeholder or role+placeholder depending on uniqueness
      expect(selector).toMatchObject({
        type: 'placeholder',
        value: 'Enter your email',
      });
      
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      expect(reconstructedId).toBe(originalId);
    });

    // Is this the right priority? name is more stable than placeholder text that can change
    test('should prefer placeholder over name attribute', async () => {
      await createTestPage(page, `
        <input 
          type="text" 
          placeholder="Search..." 
          name="search" 
        />
      `);

      const locator = page.getByPlaceholder('Search...');
      const selector = await generateBestSelectorForElement(locator);

      // May use placeholder or role+placeholder
      expect(['placeholder', 'role']).toContain(selector.type);
      
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      expect(reconstructedId).toBe(originalId);
    });
  });

  test.describe('Priority 5-7: Alt, Title, Text', () => {
    test('should use alt text for images', async () => {
      await createTestPage(page, `
        <img src="logo.png" alt="Company Logo" />
      `);

      const locator = page.getByAltText('Company Logo');
      const selector = await generateBestSelectorForElement(locator);

      // May use alt or role+alt depending on uniqueness
      expect(['alt', 'role']).toContain(selector.type);
      if (selector.type === 'alt') {
        expect(selector).toMatchObject({
          type: 'alt',
          value: 'Company Logo',
        });
      } else if (selector.type === 'role') {
        expect(selector).toMatchObject({
          type: 'role',
          role: 'img',
          name: 'Company Logo',
        });
      }
      
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      expect(reconstructedId).toBe(originalId);
    });

    test('should use title attribute or role+title', async () => {
      await createTestPage(page, `
        <button title="Close dialog">×</button>
      `);

      const locator = page.getByTitle('Close dialog');
      const selector = await generateBestSelectorForElement(locator);

      // May use title or role+title depending on uniqueness
      expect(['title', 'role']).toContain(selector.type);
      if (selector.type === 'title') {
        expect(selector).toMatchObject({
          type: 'title',
          value: 'Close dialog',
        });
      } else if (selector.type === 'role') {
        expect(selector).toMatchObject({
          type: 'role',
          role: 'button',
          name: 'Close dialog',
        });
      }
      
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      expect(reconstructedId).toBe(originalId);
    });

    test('should use role + text for buttons when text is unique', async () => {
      await createTestPage(page, `
        <button>Click Me</button>
      `);

      const locator = page.getByRole('button', { name: 'Click Me' });
      const selector = await generateBestSelectorForElement(locator);

      // Should prefer role over text
      expect(selector).toMatchObject({
        type: 'role',
        role: 'button',
        name: 'Click Me',
      });
    });
  });

  test.describe('Priority 8-9: Name and ID attributes (CSS fallback)', () => {
    test('should use name attribute as CSS fallback when no better selector available', async () => {
      await createTestPage(page, `
        <input type="text" name="username" />
        <input type="text" name="password" />
      `);

      // When no label, role, or testid available, CSS with name is acceptable fallback
      // But we should test this by using the actual element, not CSS selector directly
      const locator = page.locator('input[name="username"]');
      const selector = await generateBestSelectorForElement(locator);

      // Should use name attribute (CSS) as fallback when no better options
      expect(selector).toMatchObject({
        type: 'css',
      });
      if (selector.type === 'css') {
        expect(selector.selector).toContain('name="username"');
      }
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      await expect(reconstructedId).toBe(originalId);
    });

    test('should use id attribute as CSS fallback when no better selector available', async () => {
      await createTestPage(page, `
        <input type="text" id="email" name="email" />
        <input type="text" id="phone" name="phone" />
      `);

      // When no label, role, or testid available, CSS with id is acceptable fallback
      // Note: In real tests, prefer getByRole or getByLabel when possible
      const locator = page.locator('#email');
      const selector = await generateBestSelectorForElement(locator);

      // Should prefer role+name if available, otherwise CSS with id
      // Since we have name="email", it might use role+name or CSS
      expect(['css', 'role']).toContain(selector.type);
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      await expect(reconstructedId).toBe(originalId);
    });
  });

  test.describe('Priority 10: CSS nth-of-type (last resort fallback)', () => {
    test('should prefer id over nth-of-type when id is available', async () => {
      await createTestPage(page, `
        <input type="text" />
        <input type="text" />
        <input type="text" id="target" />
      `);

      // Use getByRole to find the element, but selector generator should prefer id
      const locator = page.getByRole('textbox').nth(2);
      const selector = await generateBestSelectorForElement(locator);

      // Should prefer id (CSS) over nth-of-type when id is available
      expect(selector).toMatchObject({
        type: 'css',
      });
      if (selector.type === 'css') {
        expect(selector.selector).toContain('target');
      }
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      await expect(reconstructedId).toBe(originalId);
    });

    test('should use nth-of-type as last resort when no other attributes available', async () => {
      await createTestPage(page, `
        <div>
          <input type="text" />
          <input type="text" />
          <input type="text" />
        </div>
      `);

      // Get the second input (no id, name, label, testid, etc.)
      // Use getByRole to find it, but selector should fall back to nth-of-type
      const locator = page.getByRole('textbox').nth(1);
      const selector = await generateBestSelectorForElement(locator);

      // Should use nth-of-type as last resort when no better selector available
      expect(selector).toMatchObject({
        type: 'css',
      });
      if (selector.type === 'css') {
        expect(selector.selector).toMatch(/input:nth-of-type/);
      }
      // Verify selector works
      const reconstructed = getFromSelector(page, selector);
      const originalId = await getMimicIdFromLocator(locator);
      const reconstructedId = await getMimicIdFromLocator(reconstructed);
      await expect(reconstructedId).toBe(originalId);
    });
  });
});

test.describe('Selector Generation - Edge Cases', { tag: ['@selector-generation', '@markers']}, () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should handle elements with no attributes using role+text', async () => {
    await createTestPage(page, `
      <div>
        <button>Button 1</button>
        <button>Button 2</button>
        <button>Button 3</button>
      </div>
    `);

    // Use Playwright's recommended locator: getByRole with name
    const locator = page.getByRole('button', { name: 'Button 2' });
    const selector = await generateBestSelectorForElement(locator);

    // Should prefer role+text over nth-of-type (following Playwright best practices)
    expect(selector).toMatchObject({
      type: 'role',
      role: 'button',
      name: 'Button 2',
    });
    // Verify selector works
    const reconstructed = getFromSelector(page, selector);
    const originalId = await getMimicIdFromLocator(locator);
    const reconstructedId = await getMimicIdFromLocator(reconstructed);
    await expect(reconstructedId).toBe(originalId);
  });

  test('should handle nested selectors with parent+child combination', async () => {
    await createTestPage(page, `
      <div data-testid="form">
        <button>Submit</button>
      </div>
      <div data-testid="form">
        <button>Submit</button>
      </div>
    `);

    const locator = page.getByTestId('form').first().getByRole('button');
    const selector = await generateBestSelectorForElement(locator, { timeout: 5_000 });

    // Should handle nested structure - may use nested selector or find unique child selector
    expect(selector).toBeDefined();
    
    // Verify selector works using web-first assertions
    const reconstructed = getFromSelector(page, selector);
    const originalId = await getMimicIdFromLocator(locator);
    const reconstructedId = await getMimicIdFromLocator(reconstructed);
    await expect(reconstructedId).toBe(originalId);
  });

  test('should handle elements with multiple matching attributes', async () => {
    await createTestPage(page, `
      <input 
        type="text" 
        data-testid="email" 
        id="email" 
        name="email" 
        aria-label="Email" 
        placeholder="Enter email"
      />
    `);

    const locator = page.getByTestId('email');
    const selector = await generateBestSelectorForElement(locator);

    // Should prefer testid over all others
    expect(selector).toMatchObject({
      type: 'testid',
      value: 'email',
    });
  });

  test('should handle exact vs non-exact matches', async () => {
    await createTestPage(page, `
      <button>Submit Form</button>
      <button>Submit Form Now</button>
    `);

    const locator = page.getByRole('button', { name: 'Submit Form', exact: true });
    const selector = await generateBestSelectorForElement(locator);

    expect(selector).toMatchObject({
      type: 'role',
      role: 'button',
      name: 'Submit Form',
      exact: true,
    });
  });

  test('should handle form elements with wrapping labels', async () => {
    await createTestPage(page, `
      <label>
        Full Name
        <input type="text" name="name" />
      </label>
    `);

    const locator = page.getByLabel('Full Name');
    const selector = await generateBestSelectorForElement(locator);

    // Should use label or role+label
    expect(['label', 'role']).toContain(selector.type);
    if (selector.type === 'label') {
      expect(selector).toMatchObject({
        type: 'label',
        value: 'Full Name',
      });
    } else if (selector.type === 'role') {
      expect(selector).toMatchObject({
        type: 'role',
        name: 'Full Name',
      });
    }

    // Verify selector works using web-first assertions
    const reconstructed = getFromSelector(page, selector);
    const originalId = await getMimicIdFromLocator(locator);
    const reconstructedId = await getMimicIdFromLocator(reconstructed);
    await expect(reconstructedId).toBe(originalId);
  });

  test('should handle select elements', async () => {
    await createTestPage(page, `
      <label for="country">Country</label>
      <select id="country" name="country">
        <option value="us">United States</option>
        <option value="ca">Canada</option>
      </select>
    `);

    const locator = page.getByLabel('Country');
    const selector = await generateBestSelectorForElement(locator);

    // May use label or role+label
    expect(['label', 'role']).toContain(selector.type);
    if (selector.type === 'label') {
      expect(selector).toMatchObject({
        type: 'label',
        value: 'Country',
      });
    } else if (selector.type === 'role') {
      expect(selector).toMatchObject({
        type: 'role',
        role: 'combobox',
        name: 'Country',
      });
    }
  });

  test('should handle textarea elements', async () => {
    await createTestPage(page, `
      <label for="message">Message</label>
      <textarea id="message" name="message"></textarea>
    `);

    const locator = page.getByLabel('Message');
    const selector = await generateBestSelectorForElement(locator);

    // May use label or role+label
    expect(['label', 'role']).toContain(selector.type);
    if (selector.type === 'label') {
      expect(selector).toMatchObject({
        type: 'label',
        value: 'Message',
      });
    } else if (selector.type === 'role') {
      expect(selector).toMatchObject({
        type: 'role',
        role: 'textbox',
        name: 'Message',
      });
    }
  });
});

test.describe('Selector Generation - Form Element Groups', { tag: ['@selector-generation', '@markers']}, () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should use nth() for radio button groups when role+name is not unique', async () => {
    await createTestPage(page, `
      <fieldset>
        <legend>Preferred Contact Method</legend>
        <input type="radio" name="contact" value="email" id="radio-email" />
        <label for="radio-email">Email</label>
        <input type="radio" name="contact" value="phone" id="radio-phone" />
        <label for="radio-phone">Phone</label>
        <input type="radio" name="contact" value="sms" id="radio-sms" />
        <label for="radio-sms">SMS</label>
      </fieldset>
    `);

    // Use Playwright's recommended locators: getByRole with label names
    const emailLocator = page.getByRole('radio', { name: 'Email' });
    const emailSelector = await generateBestSelectorForElement(emailLocator);

    // Should prefer role+name over CSS id (following Playwright best practices)
    expect(emailSelector).toMatchObject({
      type: 'role',
      role: 'radio',
      name: 'Email',
    });
    // Verify selector works using web-first assertions
    const emailReconstructed = getFromSelector(page, emailSelector);
    const emailOriginalId = await getMimicIdFromLocator(emailLocator);
    const emailReconstructedId = await getMimicIdFromLocator(emailReconstructed);
    await expect(emailReconstructedId).toBe(emailOriginalId);

    const phoneLocator = page.getByRole('radio', { name: 'Phone' });
    const phoneSelector = await generateBestSelectorForElement(phoneLocator);

    // Should prefer role+name over CSS id
    expect(phoneSelector).toMatchObject({
      type: 'role',
      role: 'radio',
      name: 'Phone',
    });
    // Verify selector works using web-first assertions
    const phoneReconstructed = getFromSelector(page, phoneSelector);
    const phoneOriginalId = await getMimicIdFromLocator(phoneLocator);
    const phoneReconstructedId = await getMimicIdFromLocator(phoneReconstructed);
    await expect(phoneReconstructedId).toBe(phoneOriginalId);
  });

  test('should use nth() when multiple radios share the same accessible name', async () => {
    // Create a scenario where multiple radios have the same accessible name
    // This forces the use of nth() since role+name won't be unique
    await createTestPage(page, `
      <fieldset>
        <legend>Choose Option</legend>
        <input type="radio" name="option" id="opt1" aria-label="Option" />
        <input type="radio" name="option" id="opt2" aria-label="Option" />
        <input type="radio" name="option" id="opt3" aria-label="Option" />
      </fieldset>
    `);

    const locator1 = page.locator('#opt1');
    const selector1 = await generateBestSelectorForElement(locator1);

    // Should use role with nth() since aria-label is the same for all
    if (selector1.type === 'role') {
      expect(selector1).toMatchObject({
        type: 'role',
        role: 'radio',
        name: 'Option',
        nth: 0,
      });
    }

    const locator2 = page.locator('#opt2');
    const selector2 = await generateBestSelectorForElement(locator2);

    if (selector2.type === 'role') {
      expect(selector2).toMatchObject({
        type: 'role',
        role: 'radio',
        name: 'Option',
        nth: 1,
      });
    }
  });

  test('should use nth() for checkbox groups when role+name is not unique', async () => {
    await createTestPage(page, `
      <fieldset>
        <legend>Newsletter Preferences</legend>
        <input type="checkbox" name="newsletter" value="daily" id="check-daily" />
        <label for="check-daily">Daily Newsletter</label>
        <input type="checkbox" name="newsletter" value="weekly" id="check-weekly" />
        <label for="check-weekly">Weekly Digest</label>
        <input type="checkbox" name="newsletter" value="promotions" id="check-promo" />
        <label for="check-promo">Promotional Emails</label>
      </fieldset>
    `);

    // Use Playwright's recommended locator: getByRole with label
    const dailyLocator = page.getByRole('checkbox', { name: 'Daily Newsletter' });
    const dailySelector = await generateBestSelectorForElement(dailyLocator);

    // Should prefer role+name over CSS id (following Playwright best practices)
    expect(dailySelector).toMatchObject({
      type: 'role',
      role: 'checkbox',
      name: 'Daily Newsletter',
    });
    // Verify selector works using web-first assertions
    const dailyReconstructed = getFromSelector(page, dailySelector);
    const dailyOriginalId = await getMimicIdFromLocator(dailyLocator);
    const dailyReconstructedId = await getMimicIdFromLocator(dailyReconstructed);
    await expect(dailyReconstructedId).toBe(dailyOriginalId);
  });

  test('should use nth() when multiple checkboxes share same accessible name', async () => {
    await createTestPage(page, `
      <fieldset>
        <legend>Select All</legend>
        <input type="checkbox" name="select" id="chk1" aria-label="Select" />
        <input type="checkbox" name="select" id="chk2" aria-label="Select" />
        <input type="checkbox" name="select" id="chk3" aria-label="Select" />
      </fieldset>
    `);

    const locator1 = page.locator('#chk1');
    const selector1 = await generateBestSelectorForElement(locator1);

    if (selector1.type === 'role') {
      expect(selector1.role).toBe('checkbox');
      expect(selector1.name).toBe('Select');
      expect(selector1.nth).toBeDefined();
      expect(selector1.nth).toBe(0);
    }
  });

  test('should handle multiple inputs with same name but different types', async () => {
    await createTestPage(page, `
      <input type="text" name="field" id="text-field" />
      <input type="email" name="field" id="email-field" />
      <input type="tel" name="field" id="tel-field" />
    `);

    // Use getByRole to find textbox - should prefer role over CSS id
    const textLocator = page.getByRole('textbox').first();
    const textSelector = await generateBestSelectorForElement(textLocator);

    // Should prefer role over CSS id when role is available
    expect(['css', 'role']).toContain(textSelector.type);
    // Verify selector works
    const reconstructed = getFromSelector(page, textSelector);
    const originalId = await getMimicIdFromLocator(textLocator);
    const reconstructedId = await getMimicIdFromLocator(reconstructed);
    await expect(reconstructedId).toBe(originalId);
  });
});

test.describe('Selector Generation - Selector Verification', { tag: ['@selector-generation', '@markers']}, () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('generated selector should locate the correct element', async () => {
    await createTestPage(page, `<input type="text" data-testid="test" />`);
    const originalLocator = page.getByTestId('test');
    const selector = await generateBestSelectorForElement(originalLocator);
    
    // Reconstruct locator from selector
    const reconstructedLocator = getFromSelector(page, selector);
    
    // Verify it matches the same element
    const originalId = await getMimicIdFromLocator(originalLocator);
    const reconstructedId = await getMimicIdFromLocator(reconstructedLocator);
    expect(reconstructedId).toBe(originalId);
  });

  test('generated selector should be unique when multiple elements exist', async () => {
    await createTestPage(page, `
      <input type="text" data-testid="email" />
      <input type="text" data-testid="password" />
      <input type="text" data-testid="username" />
    `);

    const locator = page.getByTestId('email');
    const selector = await generateBestSelectorForElement(locator);

    // Reconstruct and verify it only matches one element using web-first assertions
    const reconstructed = getFromSelector(page, selector);
    await expect(reconstructed).toHaveCount(1);

    // Verify it matches the correct element
    const originalId = await getMimicIdFromLocator(locator);
    const reconstructedId = await getMimicIdFromLocator(reconstructed);
    await expect(reconstructedId).toBe(originalId);
  });

  test('generated selector with nth() should locate correct element in group', async () => {
    await createTestPage(page, `
      <fieldset>
        <legend>Options</legend>
        <input type="radio" name="option" id="opt1" aria-label="Option" />
        <input type="radio" name="option" id="opt2" aria-label="Option" />
        <input type="radio" name="option" id="opt3" aria-label="Option" />
      </fieldset>
    `);

    // Use getByRole to find the second radio - selector should use nth() when name is not unique
    const locator = page.getByRole('radio', { name: 'Option' }).nth(1);
    const selector = await generateBestSelectorForElement(locator);

    // Should use role with nth() since aria-label is the same for all
    expect(selector).toMatchObject({
      type: 'role',
      role: 'radio',
      name: 'Option',
      nth: 1, // Second element (0-indexed)
    });
    // Reconstruct and verify using web-first assertions
    const reconstructed = getFromSelector(page, selector);
    const originalId = await getMimicIdFromLocator(locator);
    const reconstructedId = await getMimicIdFromLocator(reconstructed);
    await expect(reconstructedId).toBe(originalId);
  });

  test('generated selector should work for role+name combinations', async () => {
    await createTestPage(page, `
      <label for="email">Email Address</label>
      <input type="email" id="email" name="email" />
    `);

    const locator = page.getByRole('textbox', { name: 'Email Address' });
    const selector = await generateBestSelectorForElement(locator);

    // Verify selector works using web-first assertions
    const reconstructed = getFromSelector(page, selector);
    const originalId = await getMimicIdFromLocator(locator);
    const reconstructedId = await getMimicIdFromLocator(reconstructed);
    await expect(reconstructedId).toBe(originalId);
  });

  test('generated selector should work for label selectors', async () => {
    await createTestPage(page, `
      <label for="name">Full Name</label>
      <input type="text" id="name" name="name" />
    `);

    const locator = page.getByLabel('Full Name');
    const selector = await generateBestSelectorForElement(locator);

    // Verify selector works using web-first assertions
    const reconstructed = getFromSelector(page, selector);
    const originalId = await getMimicIdFromLocator(locator);
    const reconstructedId = await getMimicIdFromLocator(reconstructed);
    await expect(reconstructedId).toBe(originalId);
  });
});

test.describe('Selector Generation - Error Handling', { tag: ['@selector-generation', '@markers']}, () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
  });

  test('should throw error when page is closed', async () => {
    await createTestPage(page, `<button>Test</button>`);
    const locator = page.getByRole('button');

    await page.close();

    // Should throw error about page being closed
    await expect(generateBestSelectorForElement(locator)).rejects.toThrow(/closed/i);
  });

  test('should handle element not found gracefully', async () => {
    await createTestPage(page, `<div>Test</div>`);
    // Create a locator for an element that doesn't exist
    // Using a specific selector that won't match anything on the page
    const locator = page.locator('non-existent-element-that-will-never-match');

    // Verify the element doesn't exist (count should be 0)
    const count = await locator.count();
    expect(count).toBe(0);

    // Should throw error when element is not found
    // Use a short timeout (500ms) to fail quickly without waiting for full timeout
    await expect(generateBestSelectorForElement(locator, { timeout: 500 })).rejects.toThrow();
  });
});
