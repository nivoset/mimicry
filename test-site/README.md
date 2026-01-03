# Mimic Test Site

A collection of static HTML/JavaScript/CSS pages designed to test Mimic's AI-powered browser automation capabilities. This test site provides various scenarios covering navigation, form interactions, button clicking, dynamic content, accessibility features, and complex UI patterns.

## Structure

```
test-site/
├── index.html                 # Landing page with links to all test pages
├── pages/                     # Individual test pages
│   ├── simple-navigation.html
│   ├── forms-basic.html
│   ├── forms-complex.html
│   ├── buttons-variety.html
│   ├── dynamic-content.html
│   ├── accessibility.html
│   ├── multi-step-flow.html
│   └── layout-complex.html
├── assets/
│   ├── css/
│   │   └── styles.css        # Shared styles for all pages
│   └── js/
│       ├── variation.js      # Variation system for dynamic content
│       └── utils.js          # Shared utility functions
└── README.md                 # This file
```

## Test Pages

### 1. Simple Navigation (`pages/simple-navigation.html`)

Tests basic navigation scenarios:
- Internal links to other pages
- Links with URL parameters
- External links
- Browser history navigation (back/forward)
- URL parameter handling

**Test Scenarios:**
- `navigate to pages/simple-navigation.html`
- `click on "Go to Forms Page"`
- `go back`
- `go forward`

### 2. Basic Forms (`pages/forms-basic.html`)

Tests basic form interactions:
- Text inputs (name, email, phone)
- Select dropdowns
- Textarea
- Checkboxes and radio buttons
- Form submission

**Test Scenarios:**
- `type "John Doe" into the name field`
- `type "john@example.com" into the email field`
- `select "United States" from the country dropdown`
- `check "Daily Newsletter"`
- `click on "Submit Form"`

### 3. Complex Forms (`pages/forms-complex.html`)

Tests advanced form scenarios:
- Multi-step form with progress indicator
- Conditional fields (show/hide based on selections)
- Form validation
- File upload
- State management across steps

**Test Scenarios:**
- Navigate through form steps
- Select account type and see conditional fields appear
- Fill out all steps and submit
- Test form validation

### 4. Button Variety (`pages/buttons-variety.html`)

Tests button selection with various patterns:
- Buttons with text labels
- Buttons with icons only (aria-labels)
- Multiple buttons with similar text
- Links styled as buttons
- Buttons with data attributes
- Disabled buttons

**Test Scenarios:**
- `click on "Submit"`
- `click on the button with aria-label "Close dialog"`
- `click on "Save"` (disambiguation test)
- `click on the button with data-testid "submit-action"`

### 5. Dynamic Content (`pages/dynamic-content.html`)

Tests handling of dynamic content:
- Content that loads after page load
- Elements that appear/disappear
- Content that changes on interaction
- Delayed element appearance
- Infinite scroll simulation

**Test Scenarios:**
- `click on "Load Content"` and wait for content to appear
- `click on "Toggle Visibility"` to show/hide elements
- `click on "Change Content"` to see content update
- Wait for delayed elements to appear

### 6. Accessibility (`pages/accessibility.html`)

Tests accessibility-first selection strategies:
- Elements with aria-labels
- Semantic HTML (nav, main, article, aside)
- Role attributes
- Proper label associations
- ARIA landmarks
- Live regions

**Test Scenarios:**
- `click on the button with aria-label "Close this dialog"`
- `type into the username field`
- `click on "Login"` (using aria-label)
- Test semantic HTML selection

### 7. Multi-Step Flow (`pages/multi-step-flow.html`)

Tests wizard-style flows:
- Multi-step wizard with progress indicator
- State persistence across steps
- Step navigation (next/previous)
- Data collection across steps
- Review and completion

**Test Scenarios:**
- `click on "Start Wizard"`
- Fill out each step and click "Next"
- Navigate back to previous steps
- Complete the wizard and verify data

### 8. Complex Layout (`pages/layout-complex.html`)

Tests complex UI patterns:
- Modals and dialogs
- Dropdown menus
- Tabs
- Accordions
- Overlays

**Test Scenarios:**
- `click on "Open Simple Modal"`
- `click on "Actions Menu"` to open dropdown
- `click on "Tab 2"` to switch tabs
- `click on "Section 1"` to expand accordion
- `click on "Show Loading Overlay"`

## Variation System

The test site includes a variation system (`assets/js/variation.js`) that can change content dynamically over time. This helps test Mimic's ability to handle changing content.

### Features

- **Random Variation**: Content changes randomly on each page load
- **Time-based Variation**: Content changes based on time of day or day of week
- **Rotation System**: Cycles through predefined variations
- **State Persistence**: Uses localStorage to track which variation was shown

### Usage

Each page can use the variation system by importing and calling `initVariations()`:

```javascript
import { initVariations } from '../assets/js/variation.js';

initVariations({
  buttons: {
    '.submit-btn': ['Submit', 'Send', 'Go', 'Submit Form']
  },
  formFields: {
    '#email': {
      labels: ['Email', 'Email Address', 'E-mail'],
      placeholders: ['Enter email', 'your.email@example.com']
    }
  }
});
```

### Variation Strategies

- `VariationStrategy.RANDOM` - Random selection
- `VariationStrategy.TIME_BASED` - Based on current time
- `VariationStrategy.TIME_OF_DAY` - Based on hour of day
- `VariationStrategy.DAY_OF_WEEK` - Based on day of week
- `VariationStrategy.ROTATION` - Cycles through variations

## Shared Assets

### Styles (`assets/css/styles.css`)

Shared CSS providing:
- Modern, clean design
- Responsive layout
- Consistent styling across pages
- Accessible color contrasts
- Component styles (buttons, forms, cards, modals, tabs, accordions)

### Utilities (`assets/js/utils.js`)

Shared utility functions:
- `getQueryParam(name)` - Get URL query parameter
- `setQueryParam(name, value)` - Set URL query parameter
- `showAlert(message, type, container)` - Display alert message
- `debounce(func, wait)` - Debounce function calls
- `storage(key, value, expirationMs)` - localStorage with expiration
- `waitForElement(selector, timeout)` - Wait for element to appear
- `formatDate(date)` - Format date for display
- `randomId(length)` - Generate random ID

## Running the Test Site

### Option 1: Direct File Access

Simply open `index.html` in a web browser. Note that some features may be limited due to CORS restrictions when opening files directly.

### Option 2: Local Server (Recommended)

Use a local HTTP server to serve the files:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server)
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

Then navigate to `http://localhost:8000/test-site/` in your browser.

### Option 3: Playwright Web Server

Configure Playwright to serve the test-site folder:

```typescript
// playwright.config.ts
webServer: {
  command: 'npx http-server test-site -p 3000',
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env.CI,
}
```

## Testing with Mimic

Example test using Mimic:

```typescript
import { test, expect } from './test-utils';

test('navigate and fill form', async ({ page, mimic }) => {
  await mimic`
    navigate to http://localhost:3000/test-site/
    click on "Basic Forms"
    type "John Doe" into the name field
    type "john@example.com" into the email field
    select "United States" from the country dropdown
    click on "Submit Form"
  `;

  expect(page.locator('#form-result')).toBeVisible();
});
```

## Customization

All pages are static HTML files that can be easily modified:

1. **Add new test pages**: Create a new HTML file in `pages/` and add a link in `index.html`
2. **Modify variations**: Edit the `initVariations()` call in each page
3. **Add new components**: Extend `styles.css` with new component styles
4. **Add utilities**: Add new functions to `utils.js`

## Browser Compatibility

The test site uses modern JavaScript (ES6 modules) and CSS features. It should work in:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

For older browsers, you may need to transpile the JavaScript or use a polyfill.

## Notes

- All pages use ES6 modules for JavaScript
- The variation system uses localStorage (may not work in private/incognito mode)
- Some features require a local server due to CORS restrictions
- File paths are relative, so maintain the folder structure

## Contributing

When adding new test pages:
1. Follow the existing structure and naming conventions
2. Include navigation links to other pages
3. Use shared CSS and JS assets
4. Add variation support for dynamic content
5. Document the test scenarios in this README
6. Add a link to the new page in `index.html`
