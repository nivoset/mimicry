# Mimic

**Mimic** is an AI-powered browser testing framework that converts Gherkin or plain language tests into executable code, with self-repair capabilities when tests break due to code changes.

> Mimic learns how your app works, remembers what succeeds, repeats it reliably — and only thinks again when something breaks.

## Features

- 🤖 **AI-Powered Conversion**: Uses language models to understand and execute natural language test instructions
- 🎯 **Smart Element Selection**: Automatically finds and interacts with elements based on semantic understanding
- 📝 **Gherkin-Style Syntax**: Write tests in natural language, one instruction per line
- 🔄 **Self-Repair Capability**: Automatically repairs broken tests when application code changes
- 🎭 **Playwright Integration**: Built on top of Playwright for reliable browser automation
- 📊 **Token Tracking**: Built-in token usage tracking for AI model calls (early mode - working out the best way to report on usage)
- 💾 **Snapshot Storage**: Automatically saves and replays successful test executions
- 🎯 **Best Selector System**: Stores optimal selectors (role, label, testid) for reliable element identification

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

During **Learn**, Mimic:

- **Dynamically injects marker code** into the page to assign `data-mimic-id` attributes to elements, helping align the LLM on which components to interact with
- Uses an AI model to:
  - Interpret your intent
  - Reason about the structure and semantics of the page
  - Identify the most likely elements to interact with (using marker IDs to reference elements)
  - Generate executable Playwright steps

This is the most flexible phase — it's where Mimic figures out what you meant, not just what to click. The marker injection happens automatically and transparently — no changes to your application code are needed.

### 2. Remember — Capture a Verified Recording

Once the test runs successfully, Mimic remembers what worked.

It stores a verified recording (snapshot) of the execution, including:

- The resolved interaction steps with full action details
- **Best selector descriptors** for each element (role, label, testid, etc.) — not just marker IDs
- Element identification data and positioning information
- Context needed to reliably repeat the behavior
- Timestamps and execution metadata

The storage system automatically saves snapshots to `<testfile-name>.mimic.json` files alongside your test files. These snapshots contain:
- **SelectorDescriptor objects**: The best available selector for each element (e.g., `getByRole('button', { name: 'Submit' })`)
- **Mimic IDs**: Reference identifiers from dynamically injected `data-mimic-id` attributes (used during learning to help align the LLM on components)
- **Action results**: Complete details of what action was performed and how

You can review the execution (for example, via Playwright's video output) to confirm it behaves exactly as expected. Once verified, this recording becomes the trusted reference for future runs.

> **Note**: The storage system is actively being refined to improve selector stability and snapshot reliability.

### 3. Repeat — Fast, Deterministic Execution

On subsequent runs, Mimic simply repeats the recorded behavior using stored snapshots.

In this phase:

- No AI calls are made
- Token usage drops to near zero
- Tests run faster and more deterministically
- Behavior is repeatable because it's based on a known-good run
- **Selector reconstruction**: Uses stored `SelectorDescriptor` objects to rebuild locators

The replay system:
1. Loads the snapshot from the `.mimic.json` file
2. Dynamically injects marker code to assign `data-mimic-id` attributes to page elements (for reference during troubleshooting if needed)
3. Reconstructs locators from stored selector descriptors (e.g., `getByRole('button', { name: 'Submit' })`)
4. Executes actions directly without AI analysis

As long as the application hasn't changed in a way that breaks the test, Mimic stays in Repeat mode.

### 4. Troubleshoot & Fix — Adapt When Things Change

When a test can no longer repeat successfully — due to UI or structural changes — Mimic detects the failure and switches back into reasoning mode.

During **Troubleshoot & Fix**, Mimic:

- Analyzes what failed and why
- Re-learns the updated application structure
- Repairs or regenerates the broken steps (with selective regeneration: only regenerates steps that failed or changed)
- Saves a new verified recording

Once repaired and validated, the test returns to Repeat mode — stable, fast, and low-cost again.

**Troubleshoot Mode**: You can force Mimic to regenerate snapshots by running tests with the `--troubleshoot` flag:
```bash
npx playwright test --troubleshoot
```

Even in troubleshoot mode, Mimic will attempt to use existing snapshots first and only regenerate if replay fails.

### The Full Loop

**Learn → Remember → Repeat → Troubleshoot & Fix → Repeat**

AI is invoked only when something is new or broken.  
Everything else runs on verified knowledge.

## Architecture

Built on top of Playwright with AI model integration for natural language processing and test repair. Converts plain language or Gherkin syntax into executable Playwright test code, then monitors test execution to detect failures and automatically repair broken tests when application code changes.

### Element Identification System

Mimic uses a sophisticated element identification system:

- **Dynamic Marker Injection**: Automatically injects `data-mimic-id` attributes into page elements at runtime. These identifiers are added dynamically to help align the LLM on which components to interact with during the learning phase, without requiring any manual changes to your application code.
- **Best Selector Generation**: Generates optimal selectors using Playwright's semantic locators:
  - `getByRole()` for ARIA roles
  - `getByLabel()` for form labels
  - `getByTestId()` for test IDs
  - `getByText()` for visible text
  - CSS selectors as fallback
- **Snapshot Storage**: Stores `SelectorDescriptor` objects (JSON-serializable) in snapshots for fast replay

The marker system works entirely behind the scenes — Mimic dynamically loads marker code into the page to assign `data-mimic-id` attributes to interactive, display, and structural elements. These markers help the LLM identify and reference elements during the learning phase, making element identification more reliable without requiring any modifications to your application.

This ensures tests remain stable even when DOM structure changes, while preferring semantic selectors over brittle CSS paths.

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
import { LanguageModel } from 'ai';

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
      // eyes is optional and may be removed in future versions
      // If provided, can use a different model for visual analysis
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

Mimic supports the following form actions:
- `type`: Type text character by character (simulates real typing)
- `fill`: Replace all content in a field with text (faster, preferred for most cases)
- `select`: Select an option from a dropdown/select element
- `check`: Check a checkbox
- `uncheck`: Uncheck a checkbox
- `clear`: Clear field content
- `press`: Press a single keyboard key (e.g., "Enter", "Tab", "Escape")
- `setInputFiles`: Upload a file

```typescript
await mimic`
  type "john@example.com" into the email field
  fill the password field with "secret123"
  select "United States" from the country dropdown
  check the terms and conditions checkbox
  uncheck the newsletter checkbox
  clear the message field
  press "Enter" in the search field
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
      // eyes is optional and may be removed in future versions
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
- `config.eyes` (optional): Language model for visual analysis (may be removed in future versions)
- `config.testInfo` (optional): Playwright `TestInfo` object for test tracking

**Returns:** A function that accepts template literals

### `mimic(input, config)`

Direct function call version.

**Parameters:**
- `input` (string): Newline-separated test steps
- `config`: Same as `createMimic`

## Snapshot Files

Mimic automatically creates snapshot files (`.mimic.json`) in `__mimic__/` directories alongside your test files. Each file can contain multiple test snapshots, with each test identified by a unique `testHash`.

### Snapshot File Structure

The snapshot file is a JSON object containing a `tests` array:

```json
{
  "tests": [
    {
      "testHash": "abc123...",
      "testText": "click on \"Submit\"\nfill the email field with \"test@example.com\"",
      "stepsByHash": {
        "def456...": {
          "stepHash": "def456...",
          "stepIndex": 0,
          "stepText": "click on \"Submit\"",
          "actionKind": "click",
          "actionDetails": { ... },
          "targetElement": {
            "selector": {
              "type": "role",
              "role": "button",
              "name": "Submit"
            },
            "mimicId": 42
          },
          "executedAt": "2024-01-01T12:00:00.000Z"
        }
      },
      "steps": [
        {
          "stepHash": "def456...",
          "stepIndex": 0,
          "stepText": "click on \"Submit\"",
          "actionKind": "click",
          "actionDetails": { ... },
          "targetElement": {
            "selector": {
              "type": "role",
              "role": "button",
              "name": "Submit"
            },
            "mimicId": 42
          },
          "executedAt": "2024-01-01T12:00:00.000Z"
        }
      ],
      "flags": {
        "needsRetry": false,
        "hasErrors": false,
        "troubleshootingEnabled": false,
        "skipSnapshot": false,
        "forceRegenerate": false,
        "debugMode": false,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "lastPassedAt": "2024-01-01T12:00:00.000Z",
        "lastFailedAt": null
      }
    }
  ]
}
```

### Snapshot Structure Details

Each test snapshot contains:

- **testHash**: Unique identifier for the test (hash of test text)
- **testText**: Original test text (mimic template string)
- **stepsByHash**: Object mapping step hashes to step data (for efficient lookup and selective regeneration)
- **steps**: Array of executed steps in order (for backward compatibility and ordered replay)
  - **stepHash**: Unique identifier for the step (hash of step text)
  - **stepIndex**: Index of the step in the test (0-based)
  - **stepText**: Original step text
  - **actionKind**: Type of action ("click", "form update", "navigation")
  - **actionDetails**: Complete details of what action was performed
  - **targetElement**: Contains `SelectorDescriptor` (primary selector) and `mimicId` (reference identifier used during learning)
  - **executedAt**: Timestamp when the step was executed
- **flags**: Metadata about the snapshot (needsRetry, hasErrors, troubleshootingEnabled, etc.)

**Note**: The `mimicId` values in snapshots reference `data-mimic-id` attributes that are dynamically injected into the page by Mimic at runtime. These markers are used during the learning phase to help align the LLM on which components to interact with — you don't need to add them to your application code.

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

**Note**: The `eyes` parameter is optional and may be removed in future versions. Currently, if not provided, the `brains` model is used for all operations.

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

Mimic also captures an initial screenshot with markers and attaches it to the test report, making it easy to see the page state at the start of the test.

### 4. Handle Dynamic Content

For dynamic content, combine mimic with Playwright waits:

```typescript
await mimic`click on "Load More"`;
await page.waitForSelector('text=New Content');
await mimic`click on "New Content"`;
```

Mimic automatically handles waiting for elements to be ready before interacting with them, but you may need additional waits for complex dynamic content.

### 5. Token Usage

Mimic tracks token usage automatically (early mode - we're working out the best way to report on usage). Monitor your AI provider's usage to optimize costs:

- Use smaller models (like `gpt-4o-mini`) for faster, cheaper tests
- Use larger models only when needed for complex reasoning

## Troubleshooting

### Element Not Found

If mimic can't find an element, try:
1. Be more specific: `click on "Submit" button` instead of `click on "Submit"`
2. Use unique identifiers: `click on the login button with id "submit-btn"`
3. Check if the element is visible: Add a wait before the action
4. **Check snapshots**: If a test was previously working, check the `.mimic.json` snapshot file to see what selector was used

### Slow Execution

AI model calls take time. To speed up:
1. Use faster models (e.g., `gpt-4o-mini` instead of `gpt-4`)
2. Batch related actions when possible
3. Use Playwright's native selectors for simple, stable elements
4. **Leverage snapshots**: Once a test passes, subsequent runs use snapshots and skip AI calls entirely

### Snapshot Issues

If snapshots aren't working as expected:
1. Check that `.mimic.json` files are being created in `__mimic__/` directories
2. Verify selector descriptors in snapshots are valid
3. If selectors become stale, Mimic will automatically regenerate the affected steps
4. Delete the snapshot file to force regeneration if needed
5. Use `--troubleshoot` flag to force regeneration: `npx playwright test --troubleshoot`

### Troubleshoot Mode

Troubleshoot mode can be enabled by passing the `--troubleshoot` flag when running tests:

```bash
npx playwright test --troubleshoot
```

This mode:
- Still attempts to use existing snapshots first
- Regenerates actions only if snapshot replay fails
- Useful for debugging and updating snapshots after fixing issues

### Storage System

The snapshot storage system provides:
- ✅ Automatic snapshot creation on successful test runs
- ✅ Selector descriptor storage for reliable element identification
- ✅ Fast replay without AI calls
- ✅ Selective regeneration: only regenerates steps that don't exist or have changed
- ✅ Multiple tests per snapshot file (organized by testHash)
- ✅ Efficient lookup using `stepsByHash` for fast step retrieval

### API Key Issues

Ensure your `.env` file is loaded:
```typescript
import "dotenv/config"; // At the top of your test-utils.ts
```

### Test Tags

Test tags like `@mimic` are used for internal reference and filtering during development. They are not part of the public API and may change.

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

