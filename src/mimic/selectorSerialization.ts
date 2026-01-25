import type {
  StringOrRegex,
  StringOrRegexJson,
  RegexPattern,
  SelectorDescriptor,
  PlaywrightLocatorJson,
  TestIdSelector,
  RoleSelector,
  LabelSelector,
  PlaceholderSelector,
  AltTextSelector,
  TitleSelector,
  TextSelector,
  CssSelector,
} from './selectorTypes.js';

/**
 * Convert a StringOrRegex to its JSON-serializable format
 * 
 * @param value - String or RegExp to convert
 * @returns JSON-serializable representation
 */
export function stringOrRegexToJson(value: StringOrRegex): StringOrRegexJson {
  if (value instanceof RegExp) {
    return {
      __regex: true,
      pattern: value.source,
      flags: value.flags,
    };
  }
  return value;
}

/**
 * Convert a JSON value back to StringOrRegex (runtime format)
 * 
 * This helper converts StringOrRegexJson (from JSON) to StringOrRegex (for use with Playwright APIs)
 * 
 * @param value - JSON value (string or RegexPattern object)
 * @returns String or RegExp for runtime use
 */
export function jsonToStringOrRegex(value: StringOrRegexJson): StringOrRegex {
  if (typeof value === 'object' && value !== null && '__regex' in value && value.__regex === true) {
    const regexPattern = value as RegexPattern;
    return new RegExp(regexPattern.pattern, regexPattern.flags || '');
  }
  return value as string;
}

/**
 * Convert a StringOrRegexJson to Playwright format (string or regex pattern object)
 * 
 * @param value - StringOrRegexJson value to convert
 * @returns String, RegExp, or RegexPattern for Playwright format
 */
function stringOrRegexJsonToPlaywrightBody(value: StringOrRegexJson): string | RegExp | RegexPattern {
  if (typeof value === 'object' && value !== null && '__regex' in value && value.__regex === true) {
    return value as RegexPattern;
  }
  return value as string;
}

/**
 * Convert Playwright body format to StringOrRegexJson
 * 
 * @param body - Playwright body (string, RegExp, or RegexPattern)
 * @returns StringOrRegexJson format
 */
function playwrightBodyToStringOrRegexJson(body: string | RegExp | RegexPattern): StringOrRegexJson {
  if (typeof body === 'object' && body !== null) {
    if ('__regex' in body && body.__regex === true) {
      // Already a RegexPattern
      return body as RegexPattern;
    }
    if (body instanceof RegExp) {
      // Convert RegExp to RegexPattern
      return {
        __regex: true,
        pattern: body.source,
        flags: body.flags,
      };
    }
  }
  return body as string;
}

/**
 * Convert a SelectorDescriptor to Playwright-compatible JSON format
 * 
 * Converts the legacy SelectorDescriptor format to Playwright's JsonlLocatorFactory structure.
 * This enables compatibility with Playwright's codegen and future tooling.
 * 
 * @param descriptor - SelectorDescriptor to convert
 * @returns PlaywrightLocatorJson representation
 * 
 * @example
 * ```typescript
 * const descriptor: RoleSelector = {
 *   type: 'role',
 *   role: 'button',
 *   name: 'Submit',
 *   exact: true
 * };
 * const playwrightJson = selectorDescriptorToPlaywrightJson(descriptor);
 * // Returns: { kind: 'role', body: 'button', options: { name: 'Submit', exact: true } }
 * ```
 */
export function selectorDescriptorToPlaywrightJson(descriptor: SelectorDescriptor): PlaywrightLocatorJson {
  let result: PlaywrightLocatorJson;
  
  switch (descriptor.type) {
    case 'testid': {
      const testIdSelector = descriptor as TestIdSelector;
      result = {
        kind: 'test-id',
        body: testIdSelector.value,
      };
      // Handle child selector by chaining
      if (testIdSelector.child) {
        result.next = selectorDescriptorToPlaywrightJson(testIdSelector.child);
      }
      break;
    }
    
    case 'role': {
      const roleSelector = descriptor as RoleSelector;
      const options: PlaywrightLocatorJson['options'] = {};
      
      // Convert role to body (role is the ARIA role string)
      // Type assertion needed because AriaRole is a union type that includes the string
      result = {
        kind: 'role',
        body: String(roleSelector.role),
      };
      
      // Add name if present
      if (roleSelector.name !== undefined) {
        options.name = stringOrRegexJsonToPlaywrightBody(roleSelector.name);
      }
      
      // Add exact if present
      if (roleSelector.exact !== undefined) {
        options.exact = roleSelector.exact;
      }
      
      if (Object.keys(options).length > 0) {
        result.options = options;
      }
      
      // Handle nth by chaining with nth locator
      if (roleSelector.nth !== undefined) {
        result.next = {
          kind: 'nth',
          body: roleSelector.nth.toString(),
        };
        // If there's also a child, chain it after nth
        if (roleSelector.child) {
          result.next.next = selectorDescriptorToPlaywrightJson(roleSelector.child);
        }
      } else if (roleSelector.child) {
        // Chain child selector
        result.next = selectorDescriptorToPlaywrightJson(roleSelector.child);
      }
      break;
    }
    
    case 'label': {
      const labelSelector = descriptor as LabelSelector;
      result = {
        kind: 'label',
        body: stringOrRegexJsonToPlaywrightBody(labelSelector.value),
      };
      
      const options: PlaywrightLocatorJson['options'] = {};
      if (labelSelector.exact !== undefined) {
        options.exact = labelSelector.exact;
      }
      if (Object.keys(options).length > 0) {
        result.options = options;
      }
      
      // Handle nth
      if (labelSelector.nth !== undefined) {
        result.next = {
          kind: 'nth',
          body: labelSelector.nth.toString(),
        };
        if (labelSelector.child) {
          result.next.next = selectorDescriptorToPlaywrightJson(labelSelector.child);
        }
      } else if (labelSelector.child) {
        result.next = selectorDescriptorToPlaywrightJson(labelSelector.child);
      }
      break;
    }
    
    case 'placeholder': {
      const placeholderSelector = descriptor as PlaceholderSelector;
      result = {
        kind: 'placeholder',
        body: stringOrRegexJsonToPlaywrightBody(placeholderSelector.value),
      };
      
      const options: PlaywrightLocatorJson['options'] = {};
      if (placeholderSelector.exact !== undefined) {
        options.exact = placeholderSelector.exact;
      }
      if (Object.keys(options).length > 0) {
        result.options = options;
      }
      
      if (placeholderSelector.child) {
        result.next = selectorDescriptorToPlaywrightJson(placeholderSelector.child);
      }
      break;
    }
    
    case 'alt': {
      const altSelector = descriptor as AltTextSelector;
      result = {
        kind: 'alt',
        body: stringOrRegexJsonToPlaywrightBody(altSelector.value),
      };
      
      const options: PlaywrightLocatorJson['options'] = {};
      if (altSelector.exact !== undefined) {
        options.exact = altSelector.exact;
      }
      if (Object.keys(options).length > 0) {
        result.options = options;
      }
      
      if (altSelector.child) {
        result.next = selectorDescriptorToPlaywrightJson(altSelector.child);
      }
      break;
    }
    
    case 'title': {
      const titleSelector = descriptor as TitleSelector;
      result = {
        kind: 'title',
        body: stringOrRegexJsonToPlaywrightBody(titleSelector.value),
      };
      
      const options: PlaywrightLocatorJson['options'] = {};
      if (titleSelector.exact !== undefined) {
        options.exact = titleSelector.exact;
      }
      if (Object.keys(options).length > 0) {
        result.options = options;
      }
      
      if (titleSelector.child) {
        result.next = selectorDescriptorToPlaywrightJson(titleSelector.child);
      }
      break;
    }
    
    case 'text': {
      const textSelector = descriptor as TextSelector;
      result = {
        kind: 'text',
        body: stringOrRegexJsonToPlaywrightBody(textSelector.value),
      };
      
      const options: PlaywrightLocatorJson['options'] = {};
      if (textSelector.exact !== undefined) {
        options.exact = textSelector.exact;
      }
      if (Object.keys(options).length > 0) {
        result.options = options;
      }
      
      if (textSelector.child) {
        result.next = selectorDescriptorToPlaywrightJson(textSelector.child);
      }
      break;
    }
    
    case 'css': {
      const cssSelector = descriptor as CssSelector;
      result = {
        kind: 'default',
        body: cssSelector.selector,
      };
      
      if (cssSelector.child) {
        result.next = selectorDescriptorToPlaywrightJson(cssSelector.child);
      }
      break;
    }
    
    default: {
      const _exhaustive: never = descriptor;
      void _exhaustive;
      throw new Error(`Unknown selector type: ${(descriptor as any).type}`);
    }
  }
  
  return result;
}

/**
 * Convert a Playwright-compatible JSON format back to SelectorDescriptor
 * 
 * Converts Playwright's JsonlLocatorFactory structure back to the legacy SelectorDescriptor format.
 * This enables backward compatibility and migration from Playwright format to legacy format.
 * 
 * @param json - PlaywrightLocatorJson to convert
 * @returns SelectorDescriptor representation
 * 
 * @example
 * ```typescript
 * const playwrightJson: PlaywrightLocatorJson = {
 *   kind: 'role',
 *   body: 'button',
 *   options: { name: 'Submit', exact: true }
 * };
 * const descriptor = playwrightJsonToSelectorDescriptor(playwrightJson);
 * // Returns: { type: 'role', role: 'button', name: 'Submit', exact: true }
 * ```
 */
export function playwrightJsonToSelectorDescriptor(json: PlaywrightLocatorJson): SelectorDescriptor {
  let result: SelectorDescriptor;
  let child: SelectorDescriptor | undefined;
  let nth: number | undefined;
  
  // Handle chained selectors - extract nth and child
  let current: PlaywrightLocatorJson | undefined = json;
  while (current?.next) {
    if (current.next.kind === 'nth') {
      // Extract nth value
      nth = parseInt(current.next.body as string, 10);
      if (isNaN(nth)) {
        throw new Error(`Invalid nth value: ${current.next.body}`);
      }
      // Continue to next in chain
      current = current.next.next;
    } else {
      // This is a child selector - convert recursively
      child = playwrightJsonToSelectorDescriptor(current.next);
      break;
    }
  }
  
  // Convert main locator based on kind
  switch (json.kind) {
    case 'test-id': {
      const testIdSelector: TestIdSelector = {
        type: 'testid',
        value: json.body as string,
      };
      if (child) {
        testIdSelector.child = child;
      }
      result = testIdSelector;
      break;
    }
    
    case 'role': {
      // Type assertion needed because AriaRole is a union type
      const roleSelector: RoleSelector = {
        type: 'role',
        role: json.body as any, // AriaRole is a union type that includes string
      };
      
      if (json.options) {
        if (json.options.name !== undefined) {
          roleSelector.name = playwrightBodyToStringOrRegexJson(json.options.name);
        }
        if (json.options.exact !== undefined) {
          roleSelector.exact = json.options.exact;
        }
      }
      
      if (nth !== undefined) {
        roleSelector.nth = nth;
      }
      if (child) {
        roleSelector.child = child;
      }
      result = roleSelector;
      break;
    }
    
    case 'label': {
      const labelSelector: LabelSelector = {
        type: 'label',
        value: playwrightBodyToStringOrRegexJson(json.body),
      };
      
      if (json.options?.exact !== undefined) {
        labelSelector.exact = json.options.exact;
      }
      
      if (nth !== undefined) {
        labelSelector.nth = nth;
      }
      if (child) {
        labelSelector.child = child;
      }
      result = labelSelector;
      break;
    }
    
    case 'placeholder': {
      const placeholderSelector: PlaceholderSelector = {
        type: 'placeholder',
        value: playwrightBodyToStringOrRegexJson(json.body),
      };
      
      if (json.options?.exact !== undefined) {
        placeholderSelector.exact = json.options.exact;
      }
      
      if (child) {
        placeholderSelector.child = child;
      }
      result = placeholderSelector;
      break;
    }
    
    case 'alt': {
      const altSelector: AltTextSelector = {
        type: 'alt',
        value: playwrightBodyToStringOrRegexJson(json.body),
      };
      
      if (json.options?.exact !== undefined) {
        altSelector.exact = json.options.exact;
      }
      
      if (child) {
        altSelector.child = child;
      }
      result = altSelector;
      break;
    }
    
    case 'title': {
      const titleSelector: TitleSelector = {
        type: 'title',
        value: playwrightBodyToStringOrRegexJson(json.body),
      };
      
      if (json.options?.exact !== undefined) {
        titleSelector.exact = json.options.exact;
      }
      
      if (child) {
        titleSelector.child = child;
      }
      result = titleSelector;
      break;
    }
    
    case 'text': {
      const textSelector: TextSelector = {
        type: 'text',
        value: playwrightBodyToStringOrRegexJson(json.body),
      };
      
      if (json.options?.exact !== undefined) {
        textSelector.exact = json.options.exact;
      }
      
      if (child) {
        textSelector.child = child;
      }
      result = textSelector;
      break;
    }
    
    case 'default': {
      const cssSelector: CssSelector = {
        type: 'css',
        selector: json.body as string,
      };
      
      if (child) {
        cssSelector.child = child;
      }
      result = cssSelector;
      break;
    }
    
    default:
      throw new Error(`Unsupported Playwright locator kind: ${json.kind}`);
  }
  
  return result;
}
