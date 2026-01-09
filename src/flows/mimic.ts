import { ToolLoopAgent, stepCountIs, tool } from 'ai'
import { chromium, type Locator } from '@playwright/test'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import "dotenv/config"

const browser = await chromium.launch({ headless: true })

const page = await browser.newPage()

/**
 * Element schema for identifying elements on the page
 * Used by both browserTool and interactionTool
 */
const elementSchema = z.object({
  role: z.enum([
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "menuitem",
  ]).describe("role to search for").optional(),
  testid: z.string().describe("testid to search for").optional(),
  ariaLabel: z.string().describe("aria-label to search for").optional(),
  label: z.string().describe("label to search for").optional(),
  name: z.string().describe("name to search for").optional(),
  text: z.string().describe("text content of the element (especially useful for buttons)").optional(),
  type: z.string().describe("type to search for").optional(),
  href: z.string().describe("href to search for").optional(),
  dataAttributes: z.array(z.string()).describe("data-attributes to search for").optional(),
}).describe("element to interact with")

export const browserTool = tool({
  description: `Browser observation tool,
use this to look at the browser page or sub-section of it
this will return data about a list of elements.
Use 'select_options' to get all valid options from a select/dropdown element.
`,
  inputSchema: z.object({
    lookingFor: z.enum([
      "interactive elements",
      "specific role",
      "static content",
      "full_page_screenshot",
      "select_options"]).describe("type of search. Use 'full_page_screenshot' to get a screenshot of the entire page. Use 'select_options' to get all options from a select element."),
    role: z.enum([
      "button",
      "link",
      "textbox",
      "checkbox",
      "radio",
      "combobox",
      "menuitem",
    ]).describe("role to search for").optional(),
    /**
     * Element identifier for getting select options (required when lookingFor is 'select_options')
     */
    element: elementSchema.optional().describe("Element to get options from (required when lookingFor is 'select_options')"),
  }),
  needsApproval: false,
  execute: async ({ lookingFor, role, element }) => {
    console.log(`\n🔍 [browserTool] Called with:`, {
      lookingFor,
      role: role || 'none',
      element: element ? JSON.stringify(element) : 'none',
    })
    
    // Handle full page screenshot request
    if (lookingFor === 'full_page_screenshot') {
      console.log(`   → Taking full page screenshot`)
      const pageScreenshot = await page.screenshot({ type: 'png', fullPage: true })
      const pageScreenshotBase64 = pageScreenshot.toString('base64')
      const bodyAria = await page.locator('body').ariaSnapshot()
      const pageTitle = await page.title()
      const pageUrl = page.url()
      
      return [{
        aria: `Full page screenshot of: ${pageTitle}\nURL: ${pageUrl}\n\n${bodyAria}`,
        screenshot: pageScreenshotBase64,
      }]
    }
    
    // Handle select options request
    if (lookingFor === 'select_options') {
      if (!element) {
        console.log(`❌ [browserTool] Element is required for select_options`)
        return [{
          aria: `Error: Element is required when lookingFor is 'select_options'. Provide element identifier (role, testid, label, text, etc.)`
        }]
      }
      
      console.log(`   → Getting options for select element`)
      const selectElement = await getSelector(element)
      
      if (!selectElement) {
        console.log(`❌ [browserTool] Select element not found`)
        return [{
          aria: `Error: Could not find select element with identifier: ${JSON.stringify(element)}`
        }]
      }
      
      try {
        // Get all option elements from the select
        const options = await selectElement.locator('option').all()
        const optionsData = await Promise.all(options.map(async (option) => {
          const value = await option.getAttribute('value') || ''
          const text = await option.textContent() || ''
          const selected = await option.getAttribute('selected') !== null
          const disabled = await option.getAttribute('disabled') !== null
          
          return {
            value: value.trim(),
            text: text.trim(),
            selected,
            disabled,
          }
        }))
        
        // Also get the currently selected value
        const selectedValue = await selectElement.inputValue().catch(() => '')
        const selectLabel = await selectElement.getAttribute('aria-label') || 
                          await selectElement.getAttribute('name') || 
                          await selectElement.getAttribute('id') || 
                          'select'
        
        const optionsList = optionsData
          .map((opt, index) => {
            const status = opt.selected ? ' [SELECTED]' : ''
            const disabledStatus = opt.disabled ? ' [DISABLED]' : ''
            return `  ${index + 1}. Value: "${opt.value}" | Text: "${opt.text}"${status}${disabledStatus}`
          })
          .join('\n')
        
        const result = `Select element options for "${selectLabel}":
Currently selected: "${selectedValue}"

Available options (${optionsData.length}):
${optionsList}

To select an option, use interactionTool with action "select" and value set to one of the option values above.`
        
        console.log(`✅ [browserTool] Found ${optionsData.length} option(s) for select element`)
        return [{
          aria: result
        }]
      } catch (error) {
        console.log(`❌ [browserTool] Error getting select options: ${error instanceof Error ? error.message : String(error)}`)
        return [{
          aria: `Error getting select options: ${error instanceof Error ? error.message : String(error)}`
        }]
      }
    }
    
    let elements: Locator[] = []
    if (lookingFor === 'interactive elements') {
      elements = await page.locator('button, a, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="radio"], [role="combobox"], [role="menuitem"], [role="tab"], [role="option"], [tabindex]:not([tabindex="-1"])').all()
    }
    if (lookingFor === 'specific role' && role) {
      elements = await page.getByRole(role, {  }).all()
    }
    if (lookingFor === 'static content') {
      elements = await page.locator('*').filter({ hasText: 'Static content' }).all()
    }



    // Return text-only result
    const textResult = (await Promise.all(elements.map(async element => {
      const testid = element.getAttribute('data-testid')
      const ariaContent = element.ariaSnapshot()
      
      // Get text content (especially important for buttons)
      const textContent = await element.textContent() || '';
      const trimmedText = textContent.trim();
      
      return {
        aria:` -
  role: ${await element.getAttribute('role') || 'none'}
  label: ${await element.getAttribute('aria-label') || await element.getAttribute('label') || 'none'}
  ${(await testid) ? `testid: ${await testid}` : ''}
  text: ${trimmedText || 'none'}
  aria-content: ${(await ariaContent).replaceAll('\n  ', '\n      ')}
  value or content: ${await element.getAttribute('value') || await element.getAttribute('href') || trimmedText || 'none'}
`}
    })))

    return textResult
  },
  toModelOutput: ({ output }) => {
    // Flatten all content parts into a single array
    const contentParts: Array<{ type: 'text'; text: string } | { type: 'media'; data: string; mediaType: string }> = []
    
    for (const item of output) {
      // Add text content
      contentParts.push({
        type: 'text' as const,
        text: (item as any).aria || String(item),
      })
      
      // Add screenshot if present (for full_page_screenshot)
      if ((item as any).screenshot) {
        contentParts.push({
          type: 'media' as const,
          data: (item as any).screenshot,
          mediaType: 'image/png',
        })
      }
    }
    
    return {
      type: 'content' as const,
      value: contentParts,
    }
  },
})

/**
 * Get a Playwright locator for an element based on the element schema
 * 
 * Priority order:
 * 1. testid (most specific)
 * 2. role with name/text (for buttons, uses text content if provided)
 * 3. label
 * 4. text content (for buttons and links)
 * 5. href (for links)
 * 6. data attributes
 * 
 * @param element - Element schema with identification criteria
 * @returns Playwright Locator or null if no selector can be created
 */
const getSelector = async (element: z.infer<typeof elementSchema>): Promise<Locator | null> => {
  // Priority 1: testid (most specific and reliable)
  if (element.testid) {
    console.log(`   → Getting element by testid: ${element.testid}`)
    return page.getByTestId(element.testid);
  }
  
  // Priority 2: role with name/text matching
  if (element.role) {
    // For buttons, prioritize text content if provided
    const nameOptions = element.name || element.label || element.ariaLabel || element.text || '';
    
    if (element.role === 'button' && element.text) {
      // For buttons, use getByRole with text content
      console.log(`   → Getting button by role and text: "${element.text}"`)
      return page.getByRole('button', { name: element.text, exact: false });
    } else if (nameOptions) {
      console.log(`   → Getting element by role: ${element.role} with name: "${nameOptions}"`)
      return page.getByRole(element.role, { name: nameOptions });
    } else {
      console.log(`   → Getting element by role: ${element.role}`)
      return page.getByRole(element.role);
    }
  }
  
  // Priority 3: label
  if (element.label) {
    console.log(`   → Getting element by label: ${element.label}`)
    return page.getByLabel(element.label);
  }
  
  // Priority 4: text content (especially useful for buttons and links)
  if (element.text) {
    console.log(`   → Getting element by text content: "${element.text}"`)
    // Try to find by text - works well for buttons, links, and other elements
    return page.getByText(element.text, { exact: false });
  }
  
  // Priority 5: href (for links)
  if (element.href) {
    console.log(`   → Getting link by href: ${element.href}`)
    return page.getByRole('link', { name: element.href });
  }
  
  // Priority 6: data attributes
  if (element.dataAttributes && element.dataAttributes.length > 0) {
    console.log(`   → Getting element by data attributes: ${element.dataAttributes.join(', ')}`)
    const selector = element.dataAttributes.map(attr => `[${attr}]`).join('');
    return page.locator(selector);
  }

  return null;
}

export const interactionTool = tool({
  description: `Interaction tool,
use this to interact with the browser page or sub-section of it
this will return data about a list of elements
`,
  needsApproval: false,
  inputSchema: z.object({
    action: z.enum([
      "click",
      "type",
      "select",
      "fill-out",
    ]).describe("action to perform"),
    element: elementSchema,
    button: z.enum([
      "left",
      "right",
      "middle",
    ]).describe("button to use for click event").optional(),
    modifiers: z.array(z.enum([
      "Alt",
      "Control",
      "Meta",
      "Shift",
    ])).describe("modifier to use").optional(),
    value: z.string().or(z.boolean()).describe("value to set").optional().describe("value to set if it is a select or fill-out type on an input type"),
  }),
  execute: async ({ action, element, value, button, modifiers }) => {
    console.log(`\n🖱️  [interactionTool] Called with:`, {
      action,
      element,
      value: typeof value === 'string' ? value.substring(0, 50) : value,
      button: button || 'left',
      modifiers: modifiers || [],
    })

    const el = await getSelector(element);

    if (!el) {
      console.log(`❌ [interactionTool] Element not found`)
      return `No element found for selector: ${JSON.stringify(element)} try again with a different data`
    }

    if (action === 'click') {
      console.log(`   → Clicking element with button: ${button || 'left'}`)
      await el.click({ button, modifiers });
    }
    if (action === 'type' && typeof value === 'string') {
      console.log(`   → Typing value: "${value.substring(0, 30)}${value.length > 30 ? '...' : ''}"`)
      await el.fill(value, {});
    }
    if (action === 'select' && typeof value === 'string') {
      console.log(`   → Selecting option: "${value}"`)
      await el.selectOption(value);
    }
    if (action === 'fill-out' && typeof value === 'string') {
      if (typeof value === 'boolean') {
        console.log(`   → ${value ? 'Checking' : 'Unchecking'} element`)
        if (value) {
          await el.check();
        } else {
          await el.uncheck();
        }
      } else if (typeof value === 'string') {
        console.log(`   → Filling with value: "${value.substring(0, 30)}${value.length > 30 ? '...' : ''}"`)
        await el.fill(value);
      } else {
        console.log(`❌ [interactionTool] Invalid value type: ${typeof value}`)
        return `Invalid value type: ${typeof value} for fill-out action on element, this needs to be a string or boolean`
      }
    }
    console.log(`✅ [interactionTool] Successfully performed ${action} action`)
    return `Successfully performed ${action} action on element`
  },
})

export const navigationTool = tool({
  description: `Navigation tool,
use this to navigate the browser page or sub-section of it
this will return data about the current page
`,
  needsApproval: false,
  inputSchema: z.object({
    type: z.enum([
      "openPage",
      "navigate",
      "closePage",
      "goBack",
      "goForward",
      "refresh",
    ]).describe("type of navigation to perform"),
    url: z.string().describe("url to navigate to").optional(),
    waitUntil: z.enum([
      "load",
      "domcontentloaded",
      "networkidle",
    ]).describe("wait until to wait for the page to load").optional().default("networkidle"),
  }),
  execute: async ({ type, url, waitUntil }) => {
    console.log(`\n🧭 [navigationTool] Called with:`, {
      type,
      url: url || 'none',
      waitUntil: waitUntil || 'networkidle',
    })

    switch (type) {
      case 'openPage':
        case 'navigate':
        if (url) {
          console.log(`   → Navigating to: ${url}`)
          await page.goto(url, { waitUntil });
          console.log(`   → Page loaded, waiting for: ${waitUntil}`)
        } else {
          console.log(`❌ [navigationTool] URL required for ${type}`)
        }
        break;
      case 'closePage':
        console.log(`   → Closing page`)
        await page.close({});
        break;
      case 'goBack':
        console.log(`   → Going back in history`)
        await page.goBack({ waitUntil });
        break;
      case 'goForward':
        console.log(`   → Going forward in history`)
        await page.goForward({ waitUntil });
        break;
      case 'refresh':
        console.log(`   → Refreshing page`)
        await page.reload({ waitUntil });
        break;
      default:
        console.log(`❌ [navigationTool] Invalid navigation type: ${type}`)
        return `Invalid navigation type: ${type}`
    }
    console.log(`✅ [navigationTool] Successfully performed ${type} navigation`)
    return `Successfully performed ${type} navigation`
  },
})

/**
 * Wait tool for handling loading states and element availability
 * 
 * This tool provides various wait strategies to handle dynamic content,
 * loading indicators, and element visibility states.
 */
export const waitTool = tool({
  description: `Wait tool for handling loading states and element availability.
Use this tool when you need to wait for:
- Loading indicators to disappear (smart wait)
- Elements to appear or disappear
- Network activity to complete
- Specific text or content to appear
- Fixed time periods
- Element visibility states

This is especially useful after actions that trigger dynamic content loading,
form submissions, navigation, or any async operations.
`,
  needsApproval: false,
  inputSchema: z.object({
    waitType: z.enum([
      "smart",
      "element",
      "network",
      "text",
      "fixed",
      "loaders",
    ]).describe("Type of wait to perform. 'smart' detects loading indicators automatically, 'element' waits for element state, 'network' waits for network idle, 'text' waits for text content, 'fixed' uses a fixed timeout, 'loaders' explicitly waits for loading indicators"),
    /**
     * Element to wait for (required for 'element' wait type)
     */
    element: elementSchema.optional().describe("Element to wait for (required for 'element' wait type)"),
    /**
     * State to wait for the element
     */
    elementState: z.enum([
      "visible",
      "hidden",
      "attached",
      "detached",
    ]).optional().describe("State to wait for the element (visible, hidden, attached, detached). Default: 'visible'"),
    /**
     * Text content to wait for (required for 'text' wait type)
     */
    text: z.string().optional().describe("Text content to wait for (required for 'text' wait type)"),
    /**
     * Timeout in milliseconds
     */
    timeout: z.number().optional().describe("Maximum time to wait in milliseconds. Default: 10000ms for smart/loaders, 5000ms for others"),
    /**
     * Fixed duration for fixed timeout wait
     */
    duration: z.number().optional().describe("Fixed duration in milliseconds (for 'fixed' wait type). Default: 2000ms"),
    /**
     * Maximum time to wait for loaders to disappear (for smart/loaders wait types)
     */
    loaderTimeout: z.number().optional().describe("Maximum time to wait for loaders to disappear (for smart/loaders wait types). Default: 10000ms"),
    /**
     * Whether to wait for network idle (for smart wait type)
     */
    waitForNetworkIdle: z.boolean().optional().describe("Whether to wait for network idle after loaders disappear (for smart wait type). Default: false"),
  }),
  /**
   * Execute the wait operation based on the specified wait type
   * 
   * @param params - Wait parameters
   * @returns Status message describing what was waited for and the result
   */
  execute: async ({ waitType, element, elementState, text, timeout, duration, loaderTimeout, waitForNetworkIdle }) => {
    console.log(`\n⏳ [waitTool] Called with:`, {
      waitType,
      element: element ? JSON.stringify(element) : 'none',
      elementState: elementState || 'visible',
      text: text || 'none',
      timeout: timeout || 'default',
      duration: duration || 'default',
      loaderTimeout: loaderTimeout || 'default',
      waitForNetworkIdle: waitForNetworkIdle || false,
    })

    const defaultTimeout = timeout || 10000;
    const defaultDuration = duration || 2000;
    const defaultLoaderTimeout = loaderTimeout || 10000;

    try {
      switch (waitType) {
        case 'smart': {
          // Smart wait: detect and wait for loading indicators
          // Common loading indicator selectors
          const LOADING_INDICATORS = [
            '[class*="loading"]',
            '[class*="spinner"]',
            '[class*="loader"]',
            '[id*="loading"]',
            '[id*="spinner"]',
            '[id*="loader"]',
            '[class*="progress"]',
            '[role="progressbar"]',
            'text=/loading/i',
            'text=/please wait/i',
            '[class*="skeleton"]',
            '[class*="overlay"][class*="loading"]',
            '[data-loading="true"]',
            '[data-state="loading"]',
            '[aria-busy="true"]',
          ];

          // Detect visible loading indicators
          const visibleLoaders: string[] = [];
          for (const selector of LOADING_INDICATORS) {
            try {
              const count = await page.locator(selector).count();
              if (count > 0) {
                const first = page.locator(selector).first();
                const isVisible = await first.isVisible().catch(() => false);
                if (isVisible) {
                  visibleLoaders.push(selector);
                }
              }
            } catch {
              continue;
            }
          }

          if (visibleLoaders.length > 0) {
            console.log(`   → Detected ${visibleLoaders.length} loading indicator(s), waiting for them to disappear...`)
            // Wait for loaders to disappear
            const startTime = Date.now();
            while (Date.now() - startTime < defaultLoaderTimeout) {
              const currentLoaders: string[] = [];
              for (const selector of LOADING_INDICATORS) {
                try {
                  const locator = page.locator(selector).first();
                  const isVisible = await locator.isVisible().catch(() => false);
                  if (isVisible) {
                    currentLoaders.push(selector);
                  }
                } catch {
                  continue;
                }
              }
              
              if (currentLoaders.length === 0) {
                const waitDuration = Date.now() - startTime;
                // Optionally wait for network idle
                if (waitForNetworkIdle) {
                  console.log(`   → Waiting for network idle...`)
                  try {
                    await page.waitForLoadState('networkidle', { timeout: 5000 });
                  } catch {
                    // Ignore network idle timeout
                  }
                }
                console.log(`✅ [waitTool] Smart wait completed: ${visibleLoaders.length} loader(s) disappeared in ${waitDuration}ms`)
                return `Smart wait: Detected and waited for ${visibleLoaders.length} loading indicator(s) to disappear (${waitDuration}ms)`;
              }
              
              await page.waitForTimeout(100);
            }
            
            const remainingLoaders = visibleLoaders.length;
            console.log(`⚠️  [waitTool] Smart wait timeout after ${defaultLoaderTimeout}ms`)
            return `Smart wait: Timeout after ${defaultLoaderTimeout}ms. ${remainingLoaders} loading indicator(s) may still be visible.`;
          } else {
            // No loaders detected, use fallback timeout
            console.log(`   → No loaders detected, using fallback timeout: ${defaultDuration}ms`)
            await page.waitForTimeout(defaultDuration);
            if (waitForNetworkIdle) {
              console.log(`   → Waiting for network idle...`)
              try {
                await page.waitForLoadState('networkidle', { timeout: 5000 });
              } catch {
                // Ignore network idle timeout
              }
            }
            console.log(`✅ [waitTool] Smart wait completed: No loaders, waited ${defaultDuration}ms`)
            return `Smart wait: No loading indicators detected, waited ${defaultDuration}ms`;
          }
        }

        case 'loaders': {
          console.log(`   → Waiting for loading indicators to disappear...`)
          // Explicitly wait for loading indicators (same as smart but more explicit)
          const LOADING_INDICATORS = [
            '[class*="loading"]',
            '[class*="spinner"]',
            '[class*="loader"]',
            '[id*="loading"]',
            '[id*="spinner"]',
            '[id*="loader"]',
            '[class*="progress"]',
            '[role="progressbar"]',
            'text=/loading/i',
            'text=/please wait/i',
            '[class*="skeleton"]',
            '[class*="overlay"][class*="loading"]',
            '[data-loading="true"]',
            '[data-state="loading"]',
            '[aria-busy="true"]',
          ];

          const startTime = Date.now();
          while (Date.now() - startTime < defaultLoaderTimeout) {
            let hasVisibleLoader = false;
            for (const selector of LOADING_INDICATORS) {
              try {
                const locator = page.locator(selector).first();
                const isVisible = await locator.isVisible().catch(() => false);
                if (isVisible) {
                  hasVisibleLoader = true;
                  break;
                }
              } catch {
                continue;
              }
            }
            
            if (!hasVisibleLoader) {
              const waitDuration = Date.now() - startTime;
              console.log(`✅ [waitTool] Loaders wait completed: All indicators disappeared in ${waitDuration}ms`)
              return `Loaders wait: All loading indicators disappeared (${waitDuration}ms)`;
            }
            
            await page.waitForTimeout(100);
          }
          
          console.log(`⚠️  [waitTool] Loaders wait timeout after ${defaultLoaderTimeout}ms`)
          return `Loaders wait: Timeout after ${defaultLoaderTimeout}ms. Some loading indicators may still be visible.`;
        }

        case 'element': {
          if (!element) {
            console.log(`❌ [waitTool] Element is required for 'element' wait type`)
            return `Error: Element is required for 'element' wait type`;
          }

          const el = await getSelector(element);
          if (!el) {
            console.log(`❌ [waitTool] Could not find element`)
            return `Error: Could not find element for selector: ${JSON.stringify(element)}`;
          }

          const state = elementState || 'visible';
          const elementTimeout = timeout || 5000;
          console.log(`   → Waiting for element to become ${state} (timeout: ${elementTimeout}ms)`)

          try {
            switch (state) {
              case 'visible':
                await el.waitFor({ state: 'visible', timeout: elementTimeout });
                console.log(`✅ [waitTool] Element wait completed: Element became visible`)
                return `Element wait: Element became visible`;
              case 'hidden':
                await el.waitFor({ state: 'hidden', timeout: elementTimeout });
                console.log(`✅ [waitTool] Element wait completed: Element became hidden`)
                return `Element wait: Element became hidden`;
              case 'attached':
                await el.waitFor({ state: 'attached', timeout: elementTimeout });
                console.log(`✅ [waitTool] Element wait completed: Element attached to DOM`)
                return `Element wait: Element attached to DOM`;
              case 'detached':
                await el.waitFor({ state: 'detached', timeout: elementTimeout });
                console.log(`✅ [waitTool] Element wait completed: Element detached from DOM`)
                return `Element wait: Element detached from DOM`;
            }
          } catch (error) {
            console.log(`⚠️  [waitTool] Element wait timeout after ${elementTimeout}ms`)
            return `Element wait: Timeout waiting for element to become ${state} after ${elementTimeout}ms`;
          }
        }

        case 'text': {
          if (!text) {
            console.log(`❌ [waitTool] Text is required for 'text' wait type`)
            return `Error: Text is required for 'text' wait type`;
          }

          const textTimeout = timeout || 5000;
          console.log(`   → Waiting for text "${text}" to appear (timeout: ${textTimeout}ms)`)
          try {
            await page.waitForSelector(`text=${text}`, { timeout: textTimeout });
            console.log(`✅ [waitTool] Text wait completed: Text "${text}" appeared`)
            return `Text wait: Text "${text}" appeared`;
          } catch (error) {
            console.log(`⚠️  [waitTool] Text wait timeout after ${textTimeout}ms`)
            return `Text wait: Timeout waiting for text "${text}" after ${textTimeout}ms`;
          }
        }

        case 'network': {
          const networkTimeout = timeout || 10000;
          console.log(`   → Waiting for network to become idle (timeout: ${networkTimeout}ms)`)
          try {
            await page.waitForLoadState('networkidle', { timeout: networkTimeout });
            console.log(`✅ [waitTool] Network wait completed: Network became idle`)
            return `Network wait: Network became idle`;
          } catch (error) {
            console.log(`⚠️  [waitTool] Network wait timeout after ${networkTimeout}ms`)
            return `Network wait: Timeout waiting for network idle after ${networkTimeout}ms`;
          }
        }

        case 'fixed': {
          console.log(`   → Fixed wait: ${defaultDuration}ms`)
          await page.waitForTimeout(defaultDuration);
          console.log(`✅ [waitTool] Fixed wait completed: ${defaultDuration}ms`)
          return `Fixed wait: Waited for ${defaultDuration}ms`;
        }

        default:
          console.log(`❌ [waitTool] Unknown wait type: ${waitType}`)
          return `Error: Unknown wait type: ${waitType}`;
      }
    } catch (error) {
      console.log(`❌ [waitTool] Error: ${error instanceof Error ? error.message : String(error)}`)
      return `Wait error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
})

/**
 * Task type for working memory
 */
type Task = {
  id: string;
  description: string;
  status: 'pending' | 'completed' | 'in_progress';
  completedAt?: number;
};

/**
 * Working Memory Tool for tracking completed and pending tasks
 * 
 * This tool implements a structured working memory pattern that allows the agent
 * to maintain a clear record of what has been done and what still needs to be done.
 * 
 * Best practices implemented:
 * - Structured task representation with status tracking
 * - Immediate updates upon task completion
 * - Task decomposition for complex operations
 * - Clear separation between completed and pending tasks
 */
export const workingMemoryTool = tool({
  description: `Working memory tool for tracking completed tasks and pending tasks.
Use this tool to:
- Initialize a task list from instructions
- Mark tasks as completed when finished
- Check what tasks are still pending
- Update task status
- Get a summary of progress

This helps you avoid duplicate work and ensures all tasks are completed.
`,
  needsApproval: false,
  inputSchema: z.object({
    action: z.enum([
      "initialize",
      "mark_completed",
      "mark_pending",
      "get_status",
      "get_pending",
      "get_completed",
      "add_task",
    ]).describe("Action to perform on the working memory"),
    /**
     * Task identifier (field name, action description, etc.)
     */
    taskId: z.string().optional().describe("Unique identifier for the task (e.g., 'name', 'email', 'phone', 'submit_button')"),
    /**
     * Task description
     */
    taskDescription: z.string().optional().describe("Description of the task"),
    /**
     * List of tasks to initialize (for initialize action)
     */
    tasks: z.array(z.object({
      id: z.string().describe("Task identifier"),
      description: z.string().describe("Task description"),
      status: z.enum(["pending", "completed", "in_progress"]).optional(),
    })).optional().describe("List of tasks to initialize or add"),
  }),
  /**
   * Execute working memory operations
   * 
   * Maintains an in-memory task list that tracks what has been done and what needs to be done.
   * This is a simple implementation - in production, you might want to persist this.
   */
  execute: async ({ action, taskId, taskDescription, tasks }) => {
    type WorkingMemory = {
      tasks: Map<string, Task>;
      initialized: boolean;
    };
    
    // In-memory task storage (in production, consider persisting this)
    if (!(globalThis as any).__workingMemory) {
      (globalThis as any).__workingMemory = {
        tasks: new Map<string, Task>(),
        initialized: false,
      };
    }
    
    const memory = (globalThis as any).__workingMemory as WorkingMemory;
    
    console.log(`\n🧠 [workingMemoryTool] Action: ${action}`, {
      taskId: taskId || 'none',
      taskDescription: taskDescription || 'none',
      taskCount: tasks?.length || memory.tasks.size,
    });

    switch (action) {
      case 'initialize': {
        if (!tasks || tasks.length === 0) {
          return `Error: Tasks array is required for initialize action`;
        }
        
        // Clear existing tasks and initialize new ones
        memory.tasks.clear();
        for (const task of tasks) {
          memory.tasks.set(task.id, {
            id: task.id,
            description: task.description,
            status: task.status || 'pending',
          });
        }
        memory.initialized = true;
        
        const taskList = Array.from(memory.tasks.values())
          .map(t => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.id}: ${t.description}`)
          .join('\n');
        
        console.log(`✅ [workingMemoryTool] Initialized ${memory.tasks.size} task(s)`)
        return `Initialized working memory with ${memory.tasks.size} task(s):\n${taskList}`;
      }

      case 'mark_completed': {
        if (!taskId) {
          return `Error: taskId is required for mark_completed action`;
        }
        
        const task = memory.tasks.get(taskId);
        if (!task) {
          return `Error: Task "${taskId}" not found in working memory. Use add_task first.`;
        }
        
        task.status = 'completed';
        task.completedAt = Date.now();
        memory.tasks.set(taskId, task);
        
        console.log(`✅ [workingMemoryTool] Marked task as completed: ${taskId}`)
        return `Task "${taskId}" marked as completed: ${task.description}`;
      }

      case 'mark_pending': {
        if (!taskId) {
          return `Error: taskId is required for mark_pending action`;
        }
        
        const task = memory.tasks.get(taskId);
        if (!task) {
          return `Error: Task "${taskId}" not found in working memory. Use add_task first.`;
        }
        
        task.status = 'pending';
        delete task.completedAt;
        memory.tasks.set(taskId, task);
        
        console.log(`🔄 [workingMemoryTool] Marked task as pending: ${taskId}`)
        return `Task "${taskId}" marked as pending: ${task.description}`;
      }

      case 'add_task': {
        if (!taskId || !taskDescription) {
          return `Error: taskId and taskDescription are required for add_task action`;
        }
        
        memory.tasks.set(taskId, {
          id: taskId,
          description: taskDescription,
          status: 'pending',
        });
        
        console.log(`➕ [workingMemoryTool] Added task: ${taskId}`)
        return `Task "${taskId}" added: ${taskDescription}`;
      }

      case 'get_status': {
        const allTasks = Array.from(memory.tasks.values());
        const completed = allTasks.filter(t => t.status === 'completed');
        const pending = allTasks.filter(t => t.status === 'pending');
        const inProgress = allTasks.filter(t => t.status === 'in_progress');
        
        const summary = `
Working Memory Status:
- Total tasks: ${allTasks.length}
- Completed: ${completed.length}
- Pending: ${pending.length}
- In Progress: ${inProgress.length}

${pending.length > 0 ? `\nPending tasks:\n${pending.map(t => `  - ${t.id}: ${t.description}`).join('\n')}` : ''}
${completed.length > 0 ? `\nCompleted tasks:\n${completed.map(t => `  - ${t.id}: ${t.description}`).join('\n')}` : ''}
        `.trim();
        
        console.log(`📊 [workingMemoryTool] Status: ${completed.length}/${allTasks.length} completed`)
        return summary;
      }

      case 'get_pending': {
        const pending = Array.from(memory.tasks.values())
          .filter(t => t.status === 'pending');
        
        if (pending.length === 0) {
          return `No pending tasks. All tasks are completed!`;
        }
        
        const pendingList = pending
          .map(t => `- ${t.id}: ${t.description}`)
          .join('\n');
        
        console.log(`📋 [workingMemoryTool] Found ${pending.length} pending task(s)`)
        return `Pending tasks (${pending.length}):\n${pendingList}`;
      }

      case 'get_completed': {
        const completed = Array.from(memory.tasks.values())
          .filter(t => t.status === 'completed');
        
        if (completed.length === 0) {
          return `No completed tasks yet.`;
        }
        
        const completedList = completed
          .map(t => `- ${t.id}: ${t.description}${t.completedAt ? ` (completed at ${new Date(t.completedAt).toLocaleTimeString()})` : ''}`)
          .join('\n');
        
        console.log(`✅ [workingMemoryTool] Found ${completed.length} completed task(s)`)
        return `Completed tasks (${completed.length}):\n${completedList}`;
      }

      default:
        return `Error: Unknown action "${action}"`;
    }
  },
})



export const mimic = new ToolLoopAgent({
  model: openai('gpt-4o-mini'),
  tools: {browserTool, interactionTool, navigationTool, waitTool},
  
  instructions: `You are a skilled automation tester that can read and execute multi-step instructions written in Gherkin-style natural language.

CRITICAL INSTRUCTIONS:

0. **ALWAYS START WITH A FULL PAGE SCREENSHOT**:
   - IMMEDIATELY after navigating to a page, use \`browserTool\` with lookingFor: "full_page_screenshot"
   - This gives you visual context of the entire page before you start interacting
   - The screenshot will help you understand the page layout and identify elements visually
   - Do this FIRST before any other observations or interactions

1. **Process ALL fields from each instruction line - ONE INTERACTION PER CALL**: 
   - A single line may contain multiple field assignments (e.g., "fill in name as 'john' and email as 'jo@jojo.com' and phone as '123'")
   - Extract and process EVERY field mentioned in each line, not just one
   - Do NOT skip fields or process only one field per line
   - **CRITICAL: Each field/interaction requires a SEPARATE call to \`interactionTool\`**
   - NEVER try to fill multiple fields in a single \`interactionTool\` call
   - Example: If you need to fill "name" and "email", make TWO separate calls:
     * Call 1: \`interactionTool({ action: "fill-out", element: {...name field...}, value: "john" })\`
     * Call 2: \`interactionTool({ action: "fill-out", element: {...email field...}, value: "jo@jojo.com" })\`

2. **Track completed actions using workingMemoryTool**:
   - FIRST: Use \`workingMemoryTool\` with action "initialize" to create a task list from all instructions
   - Extract ALL tasks from the instructions (e.g., "fill name", "fill email", "fill phone", "click submit")
   - BEFORE filling a field: Use \`workingMemoryTool\` with action "get_status" to check if it's already completed
   - AFTER completing a field: Use \`workingMemoryTool\` with action "mark_completed" to record completion
   - Use \`workingMemoryTool\` with action "get_pending" to see what still needs to be done
   - This ensures you never duplicate work and complete all tasks

3. **Instruction interpretation**:
   - \`open http://localhost:3000/form.html\` → Use navigationTool to navigate, THEN get full page screenshot
   - \`fill in name as "john doe"\` → Extract field "name" and value "john doe", then use interactionTool
   - \`email is "jo@jojo.com"\` → Extract field "email" and value "jo@jojo.com", then use interactionTool
   - \`fill in name as "john" and email as "jo@jojo.com" and phone as "123"\` → Extract ALL THREE fields and fill each one

4. **Workflow for filling forms**:
   a. FIRST: Parse ALL instructions and use \`workingMemoryTool\` with action "initialize" to create a complete task list
      Example: Extract tasks like ["navigate to URL", "get screenshot", "fill name", "fill email", "fill phone", "fill message", "click submit"]
   b. Navigate to the page using \`navigationTool\`
   c. IMMEDIATELY get a full page screenshot using \`browserTool\` with lookingFor: "full_page_screenshot"
   d. Use \`browserTool\` with lookingFor: "interactive elements" to observe the page and identify all available form fields
   e. For each task in your working memory:
      - Use \`workingMemoryTool\` with action "get_status" to check if already completed
      - If pending: Identify the target field using role, label, name, testid, text, or other attributes
      - **Make ONE call to \`interactionTool\` for THIS specific field/interaction only**
      - Use \`interactionTool\` with action "fill-out" or "type" to fill the field (ONE field per call)
      - IMMEDIATELY use \`workingMemoryTool\` with action "mark_completed" to record completion
      - Then move to the NEXT task and make ANOTHER separate \`interactionTool\` call
   f. After filling multiple fields, use \`waitTool\` with waitType "smart" to ensure the page is ready
   g. Use \`workingMemoryTool\` with action "get_pending" to see remaining tasks
   h. Continue until ALL tasks are completed (get_pending returns empty)
   i. **VERIFICATION AND ERROR FIXING - CRITICAL FINAL STEP**:
      - Once all tasks are marked as completed, get a full page screenshot using \`browserTool\` with lookingFor: "full_page_screenshot"
      - Use \`browserTool\` with lookingFor: "interactive elements" to observe the current state of all form fields
      - Check for any error messages, validation errors, or warning indicators on the page
      - Verify that all filled fields contain the correct values as specified in the instructions
      - Look for any visual indicators of problems (red borders, error text, warning messages, etc.)
      - If you find ANY errors or mistakes:
        * Identify what went wrong
        * Fix the issue using \`interactionTool\` (e.g., correct a field value, check a missed checkbox, etc.)
        * Get another screenshot and verify the fix
        * Repeat until all errors are resolved and the page state matches the instructions
      - Only consider the task truly complete when the page shows no errors and all fields are correctly filled

5. **Tool usage**:
   - Use \`navigationTool\` for page navigation
   - Use \`browserTool\` with lookingFor: "full_page_screenshot" to get a visual overview of the page
   - Use \`browserTool\` with lookingFor: "interactive elements" to observe the DOM and identify input fields or interactive elements
   - **Use \`browserTool\` with lookingFor: "select_options" and element identifier to get all valid options from a select/dropdown element**
     * This is essential before selecting an option - it shows you all available values and their text labels
     * Example: \`browserTool({ lookingFor: "select_options", element: { role: "combobox", name: "country" } })\`
   - **Use \`interactionTool\` ONCE per interaction** - each field fill, each click, each select requires a separate call
   - NEVER combine multiple interactions into a single \`interactionTool\` call
   - Example: Filling 3 fields = 3 separate \`interactionTool\` calls, clicking a button = 1 separate \`interactionTool\` call
   - Use \`waitTool\` after actions that might trigger loading (clicks, form submissions, navigation)

6. **Error handling and verification**:
   - If an element is ambiguous or cannot be found, get another full page screenshot using \`browserTool\` with lookingFor: "full_page_screenshot" and adjust your strategy
   - If a field is already filled, skip it and move to the next one
   - Always verify completion before moving to the next instruction
   - **After completing all tasks, ALWAYS perform final verification**:
     * Get a full page screenshot to see the final state
     * Check for error messages, validation errors, or warnings
     * Verify all field values match the instructions
     * Fix any mistakes you find
     * Re-verify until everything is correct

7. **Example processing - ONE CALL PER INTERACTION**:
   Instruction: "fill in name as 'James Bond' and email as 'jb007@jojo.com' and phone as '1234567890'"
   - Extract: name='James Bond', email='jb007@jojo.com', phone='1234567890'
   - Action: Make THREE separate \`interactionTool\` calls:
     * Call 1: \`interactionTool({ action: "fill-out", element: {role: "textbox", name: "name"}, value: "James Bond" })\`
     * Call 2: \`interactionTool({ action: "fill-out", element: {role: "textbox", name: "email"}, value: "jb007@jojo.com" })\`
     * Call 3: \`interactionTool({ action: "fill-out", element: {role: "textbox", name: "phone"}, value: "1234567890" })\`
   - Track: After each call, mark that field as completed using \`workingMemoryTool\`
   - **NEVER** try to do all three in a single \`interactionTool\` call

8. **FINAL VERIFICATION AND ERROR FIXING - MANDATORY**:
   After all tasks are completed (get_pending returns empty), you MUST:
   a. Get a full page screenshot using \`browserTool\` with lookingFor: "full_page_screenshot"
   b. Observe all interactive elements using \`browserTool\` with lookingFor: "interactive elements"
   c. Check for:
      - Error messages (look for text containing "error", "invalid", "required", "missing", etc.)
      - Validation errors (red borders, error icons, warning messages)
      - Incorrect field values (compare actual values with what was requested in instructions)
      - Missing required fields that should have been filled
      - Unchecked checkboxes that should be checked
      - Wrong selections in dropdowns
   d. If ANY issues are found:
      - Identify the specific problem
      - Use \`interactionTool\` to fix it (correct values, check boxes, select correct options, etc.)
      - Mark the fix task as completed in working memory if needed
      - Get another screenshot and verify the fix worked
      - Repeat until NO errors or mistakes remain
   e. The task is only truly complete when:
      - All fields have correct values matching the instructions
      - No error messages are visible
      - No validation errors are present
      - The page state matches what was requested
   f. This verification step is CRITICAL - do not skip it or consider the task done without it
`,
})

await page.goto('http://localhost:3000/pages/card-system.html');

// const response = await mimic.generate({
//   prompt:`
// http://localhost:3000/pages/forms-basic.html
// fill in name as "James Bond"
// and fill in the email input as "jb007@jojo.com"
// the phone input should be "1234567890"
// and the message should be welcoming and thank you for filling out the form
// you fill in the from the location of the united states
// agree to the terms and conditions
// then click on the submit button
// `}).catch(error => {
  
//   console.log("Error happened")
// })

// await page.close()
// await browser.close()


await mimic.generate({
  prompt: `
    http://localhost:3000/pages/card-system.html
    i need to see the laptop details
  `
})


// import { addMarkerCode } from '../mimic/markers.js';

// await addMarkerCode(page);
  

// import { getFromSelector, getSelectorDescriptor } from '../mimic/selectorDescriptor.js';
// // console.log(await getSelectorDescriptor(await page.getByRole('textbox', { name: 'name' })))
// const twentyEight = await getSelectorDescriptor(await page.locator('[data-mimic-id="30"]'))

// console.log(twentyEight)
// console.log(await getFromSelector(page, twentyEight).ariaSnapshot())

// await page.screenshot({ path: 'screenshot.png' })

// await getFromSelector(page, twentyEight).screenshot({ path: 'screenshot28.png' })

await page.close()
await browser.close()