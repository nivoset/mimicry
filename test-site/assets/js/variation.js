/**
 * Variation system for test-site pages
 * Provides time-based, random, and rotation-based content variation
 * to test Mimic's ability to handle changing content
 */

/**
 * Variation strategies available
 */
export const VariationStrategy = {
  RANDOM: 'random',
  TIME_BASED: 'time_based',
  ROTATION: 'rotation',
  TIME_OF_DAY: 'time_of_day',
  DAY_OF_WEEK: 'day_of_week'
};

/**
 * Get a random item from an array
 * @param {Array} array - Array of items
 * @returns {*} Random item from array
 */
export function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get multiple random items from an array (without replacement)
 * @param {Array} array - Array of items
 * @param {number} count - Number of items to select
 * @returns {Array} Array of random items
 */
export function randomChoices(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Get a random number between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random number
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get time-based variation based on hour of day
 * @param {Array} variations - Array of variations (should have 24 items for hours, or will cycle)
 * @returns {*} Variation based on current hour
 */
export function getTimeBasedVariation(variations) {
  const hour = new Date().getHours();
  return variations[hour % variations.length];
}

/**
 * Get day-of-week based variation
 * @param {Array} variations - Array of variations (should have 7 items for days, or will cycle)
 * @returns {*} Variation based on current day of week
 */
export function getDayOfWeekVariation(variations) {
  const day = new Date().getDay(); // 0 = Sunday, 6 = Saturday
  return variations[day % variations.length];
}

/**
 * Get rotation-based variation (cycles through variations)
 * @param {string} key - Storage key for tracking rotation
 * @param {Array} variations - Array of variations to rotate through
 * @returns {*} Current variation in rotation
 */
export function getRotationVariation(key, variations) {
  // Get current rotation index from localStorage
  const stored = localStorage.getItem(`rotation_${key}`);
  let index = stored ? parseInt(stored, 10) : 0;
  
  // Increment and cycle
  index = (index + 1) % variations.length;
  localStorage.setItem(`rotation_${key}`, index.toString());
  
  return variations[index];
}

/**
 * Get a greeting based on time of day
 * @returns {string} Time-appropriate greeting
 */
export function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

/**
 * Apply random text variation to elements
 * @param {string} selector - CSS selector for elements
 * @param {Array} textOptions - Array of text options
 * @param {number} count - Optional: number of elements to vary (default: all)
 */
export function varyElementText(selector, textOptions, count = null) {
  const elements = Array.from(document.querySelectorAll(selector));
  const elementsToVary = count ? randomChoices(elements, count) : elements;
  
  elementsToVary.forEach(element => {
    element.textContent = randomChoice(textOptions);
  });
}

/**
 * Apply random attribute variation to elements
 * @param {string} selector - CSS selector for elements
 * @param {string} attribute - Attribute name to vary
 * @param {Array} values - Array of attribute values
 */
export function varyElementAttribute(selector, attribute, values) {
  const elements = document.querySelectorAll(selector);
  elements.forEach(element => {
    element.setAttribute(attribute, randomChoice(values));
  });
}

/**
 * Vary button labels randomly
 * @param {Object} buttonMap - Object mapping selectors to text options
 * @example
 * varyButtons({
 *   '.submit-btn': ['Submit', 'Send', 'Go'],
 *   '.cancel-btn': ['Cancel', 'Close', 'Back']
 * })
 */
export function varyButtons(buttonMap) {
  Object.entries(buttonMap).forEach(([selector, options]) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      element.textContent = randomChoice(options);
    });
  });
}

/**
 * Vary form field labels and placeholders
 * @param {Object} fieldMap - Object mapping selectors to label/placeholder options
 * @example
 * varyFormFields({
 *   '#email': {
 *     labels: ['Email', 'Email Address', 'E-mail'],
 *     placeholders: ['Enter email', 'Your email', 'email@example.com']
 *   }
 * })
 */
export function varyFormFields(fieldMap) {
  Object.entries(fieldMap).forEach(([selector, options]) => {
    const field = document.querySelector(selector);
    if (!field) return;
    
    if (options.labels) {
      const label = document.querySelector(`label[for="${field.id}"]`);
      if (label) {
        label.textContent = randomChoice(options.labels);
      }
    }
    
    if (options.placeholders) {
      field.placeholder = randomChoice(options.placeholders);
    }
  });
}

/**
 * Shuffle the order of child elements
 * @param {string} selector - CSS selector for parent element
 */
export function shuffleChildren(selector) {
  const parent = document.querySelector(selector);
  if (!parent) return;
  
  const children = Array.from(parent.children);
  const shuffled = children.sort(() => 0.5 - Math.random());
  
  shuffled.forEach(child => parent.appendChild(child));
}

/**
 * Show/hide elements randomly
 * @param {string} selector - CSS selector for elements
 * @param {number} showProbability - Probability (0-1) that an element will be shown
 */
export function randomShowHide(selector, showProbability = 0.7) {
  const elements = document.querySelectorAll(selector);
  elements.forEach(element => {
    if (Math.random() < showProbability) {
      element.style.display = '';
    } else {
      element.style.display = 'none';
    }
  });
}

/**
 * Apply color scheme variation
 * @param {string} strategy - Variation strategy to use
 * @param {Object} colorSchemes - Object with color scheme variations
 */
export function varyColorScheme(strategy, colorSchemes) {
  let scheme;
  
  switch (strategy) {
    case VariationStrategy.RANDOM:
      scheme = randomChoice(Object.keys(colorSchemes));
      break;
    case VariationStrategy.TIME_OF_DAY:
      const hour = new Date().getHours();
      const timeKey = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
      scheme = colorSchemes[timeKey] ? timeKey : randomChoice(Object.keys(colorSchemes));
      break;
    case VariationStrategy.DAY_OF_WEEK:
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayKey = dayNames[new Date().getDay()];
      scheme = colorSchemes[dayKey] ? dayKey : randomChoice(Object.keys(colorSchemes));
      break;
    default:
      scheme = randomChoice(Object.keys(colorSchemes));
  }
  
  const colors = colorSchemes[scheme];
  document.documentElement.style.setProperty('--primary-color', colors.primary);
  document.documentElement.style.setProperty('--primary-hover', colors.primaryHover);
}

/**
 * Initialize variation system for a page
 * @param {Object} config - Configuration object with variation settings
 */
export function initVariations(config) {
  // Apply variations after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyVariations(config));
  } else {
    applyVariations(config);
  }
}

/**
 * Apply all configured variations
 * @param {Object} config - Configuration object
 */
function applyVariations(config) {
  if (config.buttons) {
    varyButtons(config.buttons);
  }
  
  if (config.formFields) {
    varyFormFields(config.formFields);
  }
  
  if (config.elementText) {
    Object.entries(config.elementText).forEach(([selector, options]) => {
      varyElementText(selector, options.text, options.count);
    });
  }
  
  if (config.shuffle) {
    config.shuffle.forEach(selector => shuffleChildren(selector));
  }
  
  if (config.showHide) {
    Object.entries(config.showHide).forEach(([selector, probability]) => {
      randomShowHide(selector, probability);
    });
  }
  
  if (config.colorScheme) {
    varyColorScheme(config.colorScheme.strategy, config.colorScheme.schemes);
  }
}
