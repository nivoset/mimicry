/**
 * Centralized Logging Module
 * 
 * Provides a unified logging interface with pino implementation for local development.
 * Supports dependency injection for testing and different environments.
 */

import pino from 'pino';
import type { Logger as PinoLogger } from 'pino';

/**
 * Logger interface that can be implemented by any logging library
 * 
 * Supports structured logging with context objects.
 */
export interface Logger {
  /**
   * Log debug-level message with optional context
   * 
   * @param context - Optional context object for structured logging
   * @param message - Log message
   */
  debug(context: Record<string, unknown> | string, message?: string): void;
  
  /**
   * Log info-level message with optional context
   * 
   * @param context - Optional context object for structured logging, or message if message is not provided
   * @param message - Log message (optional if context is a string)
   */
  info(context: Record<string, unknown> | string, message?: string): void;
  
  /**
   * Log warn-level message with optional context
   * 
   * @param context - Optional context object for structured logging, or message if message is not provided
   * @param message - Log message (optional if context is a string)
   */
  warn(context: Record<string, unknown> | string, message?: string): void;
  
  /**
   * Log error-level message with optional context
   * 
   * @param context - Optional context object for structured logging, or message if message is not provided
   * @param message - Log message (optional if context is a string)
   */
  error(context: Record<string, unknown> | string, message?: string): void;
}

/**
 * Pino logger adapter that implements the Logger interface
 */
class PinoLoggerAdapter implements Logger {
  private pinoLogger: PinoLogger;

  constructor(pinoLogger: PinoLogger) {
    this.pinoLogger = pinoLogger;
  }

  debug(context: Record<string, unknown> | string, message?: string): void {
    if (typeof context === 'string') {
      this.pinoLogger.debug(context);
    } else {
      this.pinoLogger.debug(context, message || '');
    }
  }

  info(context: Record<string, unknown> | string, message?: string): void {
    if (typeof context === 'string') {
      this.pinoLogger.info(context);
    } else {
      this.pinoLogger.info(context, message || '');
    }
  }

  warn(context: Record<string, unknown> | string, message?: string): void {
    if (typeof context === 'string') {
      this.pinoLogger.warn(context);
    } else {
      this.pinoLogger.warn(context, message || '');
    }
  }

  error(context: Record<string, unknown> | string, message?: string): void {
    if (typeof context === 'string') {
      this.pinoLogger.error(context);
    } else {
      this.pinoLogger.error(context, message || '');
    }
  }
}

/**
 * Create a pino logger instance configured for local development
 * 
 * Uses pretty printing for readable output and respects LOG_LEVEL environment variable.
 * 
 * @returns Pino logger instance
 */
export function createLogger(): PinoLogger {
  const logLevel = process.env.LOG_LEVEL || 'info';
  
  // Configure pino with pretty printing for local development
  const logger = pino({
    level: logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  });

  return logger;
}

// Singleton logger instance (lazy initialization)
let loggerInstance: Logger | null = null;

/**
 * Get the singleton logger instance
 * 
 * Creates a default pino logger if no logger has been set via setLogger().
 * 
 * @returns Logger instance
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    const pinoLogger = createLogger();
    loggerInstance = new PinoLoggerAdapter(pinoLogger);
  }
  return loggerInstance;
}

/**
 * Set a custom logger instance (for testing or different environments)
 * 
 * Allows dependency injection of logger for testing or production environments.
 * 
 * @param logger - Custom logger instance to use
 */
export function setLogger(logger: Logger): void {
  loggerInstance = logger;
}

/**
 * Reset logger to default (useful for testing)
 */
export function resetLogger(): void {
  loggerInstance = null;
}

// Export default logger instance for convenience
export const logger = getLogger();
