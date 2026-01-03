/**
 * Shared utility functions for test-site pages
 * Provides helper functions for common operations and state management
 */

/**
 * Get a query parameter from the URL
 * @param {string} name - The parameter name
 * @returns {string|null} The parameter value or null
 */
export function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

/**
 * Set a query parameter in the URL
 * @param {string} name - The parameter name
 * @param {string} value - The parameter value
 */
export function setQueryParam(name, value) {
  const url = new URL(window.location);
  url.searchParams.set(name, value);
  window.history.pushState({}, '', url);
}

/**
 * Show an alert message on the page
 * @param {string} message - The message to display
 * @param {string} type - The alert type: 'success', 'error', 'info'
 * @param {HTMLElement} container - Optional container element, defaults to body
 */
export function showAlert(message, type = 'info', container = document.body) {
  const alert = document.createElement('div');
  alert.className = `alert ${type}`;
  alert.textContent = message;
  alert.style.marginTop = '1rem';
  
  container.insertBefore(alert, container.firstChild);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    alert.remove();
  }, 5000);
}

/**
 * Debounce function to limit how often a function can be called
 * @param {Function} func - The function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Get or set a value in localStorage with optional expiration
 * @param {string} key - The storage key
 * @param {*} value - Optional value to set
 * @param {number} expirationMs - Optional expiration time in milliseconds
 * @returns {*} The stored value or null
 */
export function storage(key, value = null, expirationMs = null) {
  if (value !== null) {
    // Setting a value
    const item = {
      value,
      timestamp: Date.now(),
      expiration: expirationMs ? Date.now() + expirationMs : null
    };
    localStorage.setItem(key, JSON.stringify(item));
    return value;
  } else {
    // Getting a value
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;
    
    try {
      const item = JSON.parse(itemStr);
      
      // Check expiration
      if (item.expiration && Date.now() > item.expiration) {
        localStorage.removeItem(key);
        return null;
      }
      
      return item.value;
    } catch (e) {
      return null;
    }
  }
}

/**
 * Wait for an element to appear in the DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<HTMLElement>} The element when found
 */
export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Format a date for display
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * Generate a random ID
 * @param {number} length - Length of the ID
 * @returns {string} Random ID string
 */
export function randomId(length = 8) {
  return Math.random().toString(36).substring(2, length + 2);
}
