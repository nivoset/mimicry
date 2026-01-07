import type {
  StringOrRegex,
  StringOrRegexJson,
  RegexPattern,
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
