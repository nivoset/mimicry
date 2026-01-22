/**
 * Global error handler to catch and suppress browser extension-related errors
 * 
 * These errors occur when browser extensions inject message listeners that
 * indicate async responses but fail to send them before the channel closes.
 * This is not a bug in our code, but rather an issue with installed extensions.
 * 
 * Common error: "A listener indicated an asynchronous response by returning true,
 * but the message channel closed before a response was received"
 */

/**
 * Check if an error is related to browser extension message channels
 * @param {Error|string} error - The error object or message
 * @returns {boolean} True if the error is extension-related
 */
function isExtensionError(error) {
  const errorMessage = typeof error === 'string' ? error : 
                       (error?.message || error?.reason?.message || '');
  
  return errorMessage.includes('message channel closed') ||
         errorMessage.includes('Extension context invalidated') ||
         errorMessage.includes('Receiving end does not exist');
}

/**
 * Initialize error handlers to suppress browser extension errors
 * This should be called early in the page lifecycle, ideally in the <head>
 */
export function initErrorHandler(options = {}) {
  const { 
    logSuppressed = false, // Set to true to log suppressed errors in development
    onError = null // Optional callback for custom error handling
  } = options;

  /**
   * Handle synchronous errors
   */
  window.addEventListener('error', function(event) {
    if (isExtensionError(event.error || event.message)) {
      event.preventDefault();
      event.stopPropagation();
      
      if (logSuppressed) {
        console.debug('[ErrorHandler] Suppressed extension error:', event.message);
      }
      
      if (onError) {
        onError(event.error || new Error(event.message), 'error');
      }
      
      return false;
    }
  }, true); // Use capture phase to catch errors early

  /**
   * Handle unhandled promise rejections
   */
  window.addEventListener('unhandledrejection', function(event) {
    if (isExtensionError(event.reason)) {
      event.preventDefault();
      
      if (logSuppressed) {
        console.debug('[ErrorHandler] Suppressed extension promise rejection:', 
                     event.reason?.message || event.reason);
      }
      
      if (onError) {
        onError(event.reason, 'unhandledrejection');
      }
      
      return false;
    }
  });

  // Log initialization (only in development)
  if (logSuppressed) {
    console.debug('[ErrorHandler] Initialized error handler for browser extension errors');
  }
}

/**
 * Auto-initialize if this script is loaded directly (not as a module)
 * This allows the script to work both as a module import and as a standalone script
 */
if (typeof window !== 'undefined' && !window.__errorHandlerInitialized) {
  // Only auto-initialize in non-module context
  // In module context, call initErrorHandler() explicitly
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initErrorHandler({ logSuppressed: false });
      window.__errorHandlerInitialized = true;
    });
  } else {
    initErrorHandler({ logSuppressed: false });
    window.__errorHandlerInitialized = true;
  }
}
