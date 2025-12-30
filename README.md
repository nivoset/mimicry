# Mimicry

**Mimicry** is an AI-powered browser testing framework that takes natural language instructions and reasons through them to operate the browser and run tests. It's designed to work seamlessly with Playwright, allowing you to write tests in plain English (Gherkin-style) that are automatically executed by AI.

## Features

- 🤖 **AI-Powered**: Uses language models to understand and execute natural language test instructions
- 🎯 **Smart Element Selection**: Automatically finds and interacts with elements based on semantic understanding
- 📝 **Gherkin-Style Syntax**: Write tests in natural language, one instruction per line
- 🔄 **Multiple Action Types**: Supports navigation, clicks, form updates, and more
- 🎭 **Playwright Integration**: Built on top of Playwright for reliable browser automation
- 📊 **Token Tracking**: Built-in token usage tracking for AI model calls

## Installation

```bash
npm install mimicry
# or
pnpm install mimicry
# or
yarn add mimicry
```

## Prerequisites

- Node.js 18+ 
- Playwright installed in your project
- An AI model provider (OpenAI, Ollama, or compatible provider from the `ai` SDK)

## Quick Start

### 1. Install Dependencies

```bash
npm install @playwright/test mimicry @ai-sdk/openai ai
# or for Ollama
npm install @playwright/test mimicry ollama-ai-provider-v2 ai
```

### 2. Set Up Environment Variables

Create a `.env` file in your project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
# or for Ollama (if using local models)
OLLAMA_BASE_URL=http://localhost:11434
```

### 3. Configure Playwright Fixtures

Create a test utilities file (e.g., `test-utils.ts`):

```typescript
import "dotenv/config";
import { test as base } from '@playwright/test';
import { createMimicry, type Mimicry } from 'mimicry';
import { openai } from '@ai-sdk/openai';
// or for Ollama: import { ollama } from 'ollama-ai-provider-v2';

// Configure your AI model
const brains = openai('gpt-4o-mini');
// or for Ollama: const brains = ollama('llama3.2') as LanguageModel;

export * from '@playwright/test';

// Extend Playwright's test with mimicry fixture
export const test = base.extend<{
  mimicry: Mimicry
}>({
  mimicry: async ({ page }, use, testInfo) => {
    const mimicry = createMimicry({
      page,
      brains,
      eyes: brains, // Can use a different model for visual analysis
      testInfo,
    });
    await use(mimicry);
  }
});
```

### 4. Write Your First Test

Create a test file (e.g., `example.spec.ts`):

```typescript
import { test, expect } from './test-utils';

test('navigate and interact with Playwright docs', async ({ page, mimicry }) => {
  await mimicry`
    navigate to https://playwright.dev/
    click on "get started"
    and click on "trace viewer"
  `;

  expect(page.url()).toBe('https://playwright.dev/docs/trace-viewer-intro');
  
  await mimicry`go back`;
  
  expect(page.url()).toBe('https://playwright.dev/docs/intro');
});
```

### 5. Run Your Tests

```bash
npx playwright test
```

## Usage

### Basic Syntax

Mimicry uses a simple line-by-line syntax where each line represents a test step:

```typescript
await mimicry`
  navigate to https://example.com
  click on "Sign In"
  type "username" into the email field
  type "password123" into the password field
  click on the submit button
`;
```

### Supported Actions

#### Navigation

```typescript
await mimicry`
  navigate to https://example.com
  go back
  go forward
  refresh the page
  close the page
`;
```

#### Clicking Elements

Mimicry can find elements by:
- Visible text: `click on "Sign In"`
- Button labels: `click on the submit button`
- Link text: `click on "About Us"`
- Semantic descriptions: `click on the login button in the header`

```typescript
await mimicry`
  click on "Get Started"
  click on the search icon
  click on the menu button
`;
```

#### Form Interactions

```typescript
await mimicry`
  type "john@example.com" into the email field
  fill the password field with "secret123"
  select "United States" from the country dropdown
  check the terms and conditions checkbox
  uncheck the newsletter checkbox
`;
```

### Using Variables

You can use template literals to inject variables:

```typescript
const username = 'testuser';
const password = 'testpass';

await mimicry`
  type "${username}" into the username field
  type "${password}" into the password field
  click on "Login"
`;
```

### Combining with Playwright Assertions

Mimicry works seamlessly with Playwright's built-in assertions:

```typescript
test('complete user registration', async ({ page, mimicry }) => {
  await mimicry`
    navigate to https://example.com/register
    type "John Doe" into the name field
    type "john@example.com" into the email field
    type "SecurePass123!" into the password field
    click on "Create Account"
  `;

  // Use Playwright assertions
  await expect(page.locator('text=Welcome')).toBeVisible();
  expect(page.url()).toContain('/dashboard');
});
```

### Advanced: Direct API Usage

If you need more control, you can use the `mimicry` function directly:

```typescript
import { mimicry } from 'mimicry';
import { openai } from '@ai-sdk/openai';
import { test } from '@playwright/test';

test('custom usage', async ({ page, testInfo }) => {
  const brains = openai('gpt-4o-mini');
  
  await mimicry(
    'navigate to https://example.com\nclick on "Get Started"',
    {
      page,
      brains,
      eyes: brains,
      testInfo,
    }
  );
});
```

## API Reference

### `createMimicry(config)`

Creates a mimicry function that can be used as a template literal tag.

**Parameters:**
- `config.page` (required): Playwright `Page` object
- `config.brains` (required): Language model for reasoning (from `ai` SDK)
- `config.eyes` (required): Language model for visual analysis (can be same as brains)
- `config.testInfo` (optional): Playwright `TestInfo` object for test tracking

**Returns:** A function that accepts template literals

### `mimicry(input, config)`

Direct function call version.

**Parameters:**
- `input` (string): Newline-separated test steps
- `config`: Same as `createMimicry`

### Exported Utilities

You can also import individual utilities for custom implementations:

```typescript
import {
  getBaseAction,
  getClickAction,
  executeClickAction,
  getNavigationAction,
  executeNavigationAction,
  getFormAction,
  executeFormAction,
  captureTargets,
  buildSelectorForTarget,
} from 'mimicry';
```

## Configuration

### AI Model Selection

**OpenAI:**
```typescript
import { openai } from '@ai-sdk/openai';
const brains = openai('gpt-4o-mini'); // or 'gpt-4', 'gpt-4-turbo', etc.
```

**Ollama (Local Models):**
```typescript
import { ollama } from 'ollama-ai-provider-v2';
const brains = ollama('llama3.2') as LanguageModel;
```

**Different Models for Different Tasks:**
```typescript
const brains = openai('gpt-4o-mini'); // For reasoning
const eyes = openai('gpt-4-vision-preview'); // For visual analysis (if needed)
```

### Playwright Configuration

Ensure your `playwright.config.ts` is set up correctly:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', // or wherever your tests are
  use: {
    trace: 'on-first-retry',
  },
  // ... other config
});
```

## Best Practices

### 1. Use Descriptive Steps

Be specific in your instructions:

```typescript
// ✅ Good
await mimicry`
  click on the "Sign In" button in the header
  type "admin@example.com" into the email input field
`;

// ❌ Less clear
await mimicry`
  click button
  type email
`;
```

### 2. Combine with Assertions

Always verify the results:

```typescript
await mimicry`
  navigate to /dashboard
  click on "Create Project"
  type "My Project" into the project name field
  click on "Save"
`;

await expect(page.locator('text=My Project')).toBeVisible();
```

### 3. Use Test Steps for Debugging

Mimicry automatically creates Playwright test steps, making it easy to debug:

```typescript
// Each line becomes a test step in Playwright's trace viewer
await mimicry`
  navigate to https://example.com
  click on "Products"
  click on "View Details"
`;
```

### 4. Handle Dynamic Content

For dynamic content, combine mimicry with Playwright waits:

```typescript
await mimicry`click on "Load More"`;
await page.waitForSelector('text=New Content');
await mimicry`click on "New Content"`;
```

### 5. Token Usage

Mimicry tracks token usage automatically. Monitor your AI provider's usage to optimize costs:

- Use smaller models (like `gpt-4o-mini`) for faster, cheaper tests
- Use larger models only when needed for complex reasoning

## Troubleshooting

### Element Not Found

If mimicry can't find an element, try:
1. Be more specific: `click on "Submit" button` instead of `click on "Submit"`
2. Use unique identifiers: `click on the login button with id "submit-btn"`
3. Check if the element is visible: Add a wait before the action

### Slow Execution

AI model calls take time. To speed up:
1. Use faster models (e.g., `gpt-4o-mini` instead of `gpt-4`)
2. Batch related actions when possible
3. Use Playwright's native selectors for simple, stable elements

### API Key Issues

Ensure your `.env` file is loaded:
```typescript
import "dotenv/config"; // At the top of your test-utils.ts
```

## Examples

### E-commerce Checkout Flow

```typescript
test('complete checkout process', async ({ page, mimicry }) => {
  await mimicry`
    navigate to https://store.example.com
    click on "Add to Cart" for "Product Name"
    click on the shopping cart icon
    click on "Proceed to Checkout"
    type "john@example.com" into the email field
    type "123 Main St" into the address field
    type "New York" into the city field
    select "United States" from the country dropdown
    type "10001" into the zip code field
    click on "Continue to Payment"
    type "4242 4242 4242 4242" into the card number field
    type "12/25" into the expiration field
    type "123" into the CVV field
    click on "Place Order"
  `;

  await expect(page.locator('text=Order Confirmed')).toBeVisible();
});
```

### Form Validation Testing

```typescript
test('validate required fields', async ({ page, mimicry }) => {
  await mimicry`
    navigate to https://example.com/contact
    click on "Submit" without filling fields
  `;

  await expect(page.locator('text=Email is required')).toBeVisible();
  await expect(page.locator('text=Name is required')).toBeVisible();
});
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

