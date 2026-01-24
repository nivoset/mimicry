/**
 * Error Formatting Utility
 * 
 * Formats errors to show readable Playwright commands and their actual errors,
 * making it easier to understand what command failed and why.
 */

/**
 * Format an error with Playwright code context
 * 
 * Creates a readable error message that shows:
 * 1. The Playwright command that was executed (formatted nicely)
 * 2. The actual error from Playwright
 * 
 * @param error - The original error that occurred
 * @param playwrightCode - The Playwright code that was executed (optional)
 * @param actionDescription - Human-readable description of what action was being performed (optional)
 * @param stepText - The original Gherkin step text (optional)
 * @returns Formatted error message
 */
export function formatErrorWithPlaywrightCode(
  error: unknown,
  playwrightCode?: string,
  actionDescription?: string,
  stepText?: string
): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  // Build the error message parts
  const parts: string[] = [];
  
  // Add step context if available
  if (stepText && stepText.trim().length > 0) {
    parts.push(`Step: "${stepText}"`);
  }
  
  // Add action description if available
  if (actionDescription && actionDescription.trim().length > 0) {
    parts.push(`Action: ${actionDescription}`);
  }
  
  // Add Playwright code if available (formatted nicely)
  if (playwrightCode && playwrightCode.trim().length > 0) {
    // Format the code to be more readable
    const formattedCode = formatPlaywrightCode(playwrightCode);
    parts.push(`\nPlaywright command executed:\n${formattedCode}`);
  }
  
  // Add the actual error
  parts.push(`\nError:\n${errorMessage}`);
  
  // Optionally include stack trace for debugging (but make it less prominent)
  if (errorStack && process.env.DEBUG) {
    parts.push(`\nStack trace:\n${errorStack}`);
  }
  
  return parts.join('\n');
}

/**
 * Format Playwright code for better readability in error messages
 * 
 * @param code - Raw Playwright code string
 * @returns Formatted code with proper indentation
 */
function formatPlaywrightCode(code: string): string {
  // Remove extra whitespace and normalize
  let formatted = code.trim();
  
  // If it's a multi-line code block, ensure proper indentation
  if (formatted.includes('\n')) {
    const lines = formatted.split('\n');
    // Find the minimum indentation (excluding empty lines)
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    if (nonEmptyLines.length > 0) {
      const minIndent = Math.min(
        ...nonEmptyLines.map(line => {
          const match = line.match(/^(\s*)/);
          return match && match[1] ? match[1].length : 0;
        })
      );
      
      // Remove minimum indentation from all lines
      formatted = lines
        .map(line => {
          if (line.trim().length === 0) return '';
          return line.substring(minIndent);
        })
        .join('\n')
        .trim();
    }
  }
  
  // Add code block formatting with proper indentation
  const indent = '  ';
  const formattedLines = formatted.split('\n').map(line => indent + line);
  return formattedLines.join('\n');
}

/**
 * Create a MimicError class that includes Playwright code context
 * 
 * This extends the standard Error to include additional context
 * that can be used for better error reporting.
 */
export class MimicError extends Error {
  public readonly playwrightCode?: string;
  public readonly actionDescription?: string;
  public readonly stepText?: string;
  public readonly originalError?: unknown;
  
  constructor(
    message: string,
    options?: {
      playwrightCode?: string;
      actionDescription?: string;
      stepText?: string;
      originalError?: unknown;
      cause?: Error;
    }
  ) {
    // Format the full error message
    const fullMessage = formatErrorWithPlaywrightCode(
      new Error(message),
      options?.playwrightCode,
      options?.actionDescription,
      options?.stepText
    );
    
    super(fullMessage, { cause: options?.cause || (options?.originalError instanceof Error ? options.originalError : undefined) });
    
    this.name = 'MimicError';
    // Only assign if value is defined (for exactOptionalPropertyTypes compatibility)
    if (options?.playwrightCode !== undefined) {
      this.playwrightCode = options.playwrightCode;
    }
    if (options?.actionDescription !== undefined) {
      this.actionDescription = options.actionDescription;
    }
    if (options?.stepText !== undefined) {
      this.stepText = options.stepText;
    }
    this.originalError = options?.originalError;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MimicError);
    }
  }
}

/**
 * Wrap an error with Playwright code context
 * 
 * Convenience function to wrap any error with Playwright code context
 * without losing the original error information.
 * 
 * @param error - The original error
 * @param playwrightCode - The Playwright code that was executed
 * @param actionDescription - Human-readable description of the action
 * @param stepText - The original Gherkin step text
 * @returns A MimicError with full context
 */
export function wrapErrorWithContext(
  error: unknown,
  playwrightCode?: string,
  actionDescription?: string,
  stepText?: string
): MimicError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Build options object, only including defined values (for exactOptionalPropertyTypes compatibility)
  const errorOptions: {
    playwrightCode?: string;
    actionDescription?: string;
    stepText?: string;
    originalError?: unknown;
    cause?: Error;
  } = {
    originalError: error,
  };
  
  if (playwrightCode !== undefined) {
    errorOptions.playwrightCode = playwrightCode;
  }
  if (actionDescription !== undefined) {
    errorOptions.actionDescription = actionDescription;
  }
  if (stepText !== undefined) {
    errorOptions.stepText = stepText;
  }
  if (error instanceof Error) {
    errorOptions.cause = error;
  }
  
  return new MimicError(errorMessage, errorOptions);
}
