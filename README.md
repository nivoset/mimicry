# Mimic

**Mimic** is an AI-powered browser testing framework that converts Gherkin or plain language tests into executable code, with self-repair capabilities when tests break due to code changes.

> Mimic learns how your app works, remembers what succeeds, repeats it reliably — and only thinks again when something breaks.

## Features

- 🤖 **AI-Powered Conversion**: Uses language models to understand and execute natural language test instructions
- 🎯 **Smart Element Selection**: Automatically finds and interacts with elements based on semantic understanding
- 📝 **Gherkin-Style Syntax**: Write tests in natural language, one instruction per line
- 🔄 **Self-Repair Capability**: Automatically repairs broken tests when application code changes
- 🎭 **Playwright Integration**: Built on top of Playwright for reliable browser automation
- 📊 **Token Tracking**: Built-in token usage tracking for AI model calls

## How It Works

Mimic follows a simple, human-readable lifecycle:

**Learn → Remember → Repeat → Troubleshoot & Fix**

AI is used to learn and adapt — not to waste tokens repeating work it has already done.

### 1. Learn — Understand the Intent

You write your test in plain English or Gherkin-style steps:

```typescript
await mimic`
  navigate to https://playwright.dev/
  click on "get started"
  and click on "trace viewer"
`;
```

During **Learn**, Mimic uses an AI model to:

- Interpret your intent
- Reason about the structure and semantics of the page
- Identify the most likely elements to interact with
- Generate executable Playwright steps

This is the most flexible phase — it's where Mimic figures out what you meant, not just what to click.

### 2. Remember — Capture a Verified Recording

Once the test runs successfully, Mimic remembers what worked.

It stores a verified recording of the execution, including:

- The resolved interaction steps
- Element identification data used during the run
- Context needed to reliably repeat the behavior

You can review the execution (for example, via Playwright's video output) to confirm it behaves exactly as expected. Once verified, this recording becomes the trusted reference for future runs.

### 3. Repeat — Fast, Deterministic Execution

On subsequent runs, Mimic simply repeats the recorded behavior.

In this phase:

- No AI calls are made
- Token usage drops to near zero
- Tests run faster and more deterministically
- Behavior is repeatable because it's based on a known-good run

As long as the application hasn't changed in a way that breaks the test, Mimic stays in Repeat mode.

### 4. Troubleshoot & Fix — Adapt When Things Change

When a test can no longer repeat successfully — due to UI or structural changes — Mimic detects the failure and switches back into reasoning mode.

During **Troubleshoot & Fix**, Mimic:

- Analyzes what failed and why
- Re-learns the updated application structure
- Repairs or regenerates the broken steps
- Saves a new verified recording

Once repaired and validated, the test returns to Repeat mode — stable, fast, and low-cost again.

### The Full Loop

**Learn → Remember → Repeat → Troubleshoot & Fix → Repeat**

AI is invoked only when something is new or broken.  
Everything else runs on verified knowledge.

## Architecture

Built on top of Playwright with AI model integration for natural language processing and test repair. Converts plain language or Gherkin syntax into executable Playwright test code, then monitors test execution to detect failures and automatically repair broken tests when application code changes.

### Technology Stack

- **TypeScript**
- **Node.js**
- **Playwright**

## Installation

```bash
npm install playwright-mimic
# or
pnpm install playwright-mimic
# or
yarn add playwright-mimic
```

## Prerequisites

- Node.js 18+ 
- Playwright installed in your project
- An AI model provider (OpenAI, Ollama, or compatible provider from the `ai` SDK)

## Quick Start

### 1. Install Dependencies

```bash
npm install @playwright/test playwright-mimic @ai-sdk/openai ai
# or for Ollama
npm install @playwright/test playwright-mimic ollama-ai-provider-v2 ai
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
import { createMimic, type Mimic } from 'playwright-mimic';
import { openai } from '@ai-sdk/openai';
// or for Ollama: import { ollama } from 'ollama-ai-provider-v2';

// Configure your AI model
const brains = openai('gpt-4o-mini');
// or for Ollama: const brains = ollama('llama3.2') as LanguageModel;

export * from '@playwright/test';

// Extend Playwright's test with mimic fixture
export const test = base.extend<{
  mimic: Mimic
}>({
  mimic: async ({ page }, use, testInfo) => {
    const mimic = createMimic({
      page,
      brains,
      eyes: brains, // Can use a different model for visual analysis
      testInfo,
    });
    await use(mimic);
  }
});
```

### 4. Write Your First Test

Create a test file (e.g., `example.spec.ts`):

```typescript
import { test, expect } from './test-utils';

test('navigate and interact with Playwright docs', async ({ page, mimic }) => {
  await mimic`
    navigate to https://playwright.dev/
    click on "get started"
    and click on "trace viewer"
  `;

  expect(page.url()).toBe('https://playwright.dev/docs/trace-viewer-intro');
  
  await mimic`go back`;
  
  expect(page.url()).toBe('https://playwright.dev/docs/intro');
});
```

### 5. Run Your Tests

```bash
npx playwright test
```

## Usage

### Basic Syntax

Mimic uses a simple line-by-line syntax where each line represents a test step:

```typescript
await mimic`
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
await mimic`
  navigate to https://example.com
  go back
  go forward
  refresh the page
  close the page
`;
```

#### Clicking Elements

Mimic can find elements by:
- Visible text: `click on "Sign In"`
- Button labels: `click on the submit button`
- Link text: `click on "About Us"`
- Semantic descriptions: `click on the login button in the header`

```typescript
await mimic`
  click on "Get Started"
  click on the search icon
  click on the menu button
`;
```

#### Form Interactions

```typescript
await mimic`
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

await mimic`
  type "${username}" into the username field
  type "${password}" into the password field
  click on "Login"
`;
```

### Combining with Playwright Assertions

Mimic works seamlessly with Playwright's built-in assertions:

```typescript
test('complete user registration', async ({ page, mimic }) => {
  await mimic`
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

If you need more control, you can use the `mimic` function directly:

```typescript
import { mimic } from 'playwright-mimic';
import { openai } from '@ai-sdk/openai';
import { test } from '@playwright/test';

test('custom usage', async ({ page, testInfo }) => {
  const brains = openai('gpt-4o-mini');
  
  await mimic(
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

### `createMimic(config)`

Creates a mimic function that can be used as a template literal tag.

**Parameters:**
- `config.page` (required): Playwright `Page` object
- `config.brains` (required): Language model for reasoning (from `ai` SDK)
- `config.eyes` (required): Language model for visual analysis (can be same as brains)
- `config.testInfo` (optional): Playwright `TestInfo` object for test tracking

**Returns:** A function that accepts template literals

### `mimic(input, config)`

Direct function call version.

**Parameters:**
- `input` (string): Newline-separated test steps
- `config`: Same as `createMimic`

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
} from 'playwright-mimic';
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
await mimic`
  click on the "Sign In" button in the header
  type "admin@example.com" into the email input field
`;

// ❌ Less clear
await mimic`
  click button
  type email
`;
```

### 2. Combine with Assertions

Always verify the results:

```typescript
await mimic`
  navigate to /dashboard
  click on "Create Project"
  type "My Project" into the project name field
  click on "Save"
`;

await expect(page.locator('text=My Project')).toBeVisible();
```

### 3. Use Test Steps for Debugging

Mimic automatically creates Playwright test steps, making it easy to debug:

```typescript
// Each line becomes a test step in Playwright's trace viewer
await mimic`
  navigate to https://example.com
  click on "Products"
  click on "View Details"
`;
```

### 4. Handle Dynamic Content

For dynamic content, combine mimic with Playwright waits:

```typescript
await mimic`click on "Load More"`;
await page.waitForSelector('text=New Content');
await mimic`click on "New Content"`;
```

### 5. Token Usage

Mimic tracks token usage automatically. Monitor your AI provider's usage to optimize costs:

- Use smaller models (like `gpt-4o-mini`) for faster, cheaper tests
- Use larger models only when needed for complex reasoning

## Troubleshooting

### Element Not Found

If mimic can't find an element, try:
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
test('complete checkout process', async ({ page, mimic }) => {
  await mimic`
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
test('validate required fields', async ({ page, mimic }) => {
  await mimic`
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

