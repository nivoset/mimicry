/**
 * Agentic System Test Example
 * 
 * Demonstrates the agentic browser automation system with goal-oriented execution.
 */

import { test, expect } from './test-utils';
import { createAgenticMimic } from './agentic-mimic';
import { brains } from './test-utils';

test.describe('Agentic System', () => {
  test('should execute goal-oriented task using agentic system', async ({ page }) => {
    // Create agentic mimic function
    const agenticMimic = createAgenticMimic({
      page,
      brains,
      enablePlanning: true,
      enableReflection: true,
      maxActions: 20,
    });

    // Execute a goal-oriented task
    // The agent will plan, reason, act, and reflect to achieve this goal
    const result = await agenticMimic`
      Navigate to https://playwright.dev/
      Find and click on the "Get started" link
      Verify that you are on the getting started page
    `;

    // Assertions
    expect(result.success).toBe(true);
    expect(result.actionsTaken).toBeGreaterThan(0);
    expect(page.url()).toContain('playwright.dev');
  });

  test('should handle complex multi-step goal', async ({ page }) => {
    const agenticMimic = createAgenticMimic({
      page,
      brains,
      enablePlanning: true,
      enableReflection: true,
      maxActions: 30,
    });

    const result = await agenticMimic`
      Go to https://playwright.dev/
      Navigate to the documentation section
      Find information about trace viewer
      Verify the page contains trace viewer content
    `;

    expect(result.success).toBe(true);
    expect(result.goalAchieved).toBe(true);
  });

  test('should recover from errors and retry', async ({ page }) => {
    const agenticMimic = createAgenticMimic({
      page,
      brains,
      enablePlanning: true,
      enableReflection: true,
      maxRetries: 3,
      maxActions: 25,
    });

    // This goal might fail initially but should recover
    const result = await agenticMimic`
      Navigate to https://playwright.dev/
      Click on a button that might not exist immediately
      Wait for the page to load
      Verify successful navigation
    `;

    // Even if some steps fail, the agent should attempt recovery
    expect(result.actionsTaken).toBeGreaterThan(0);
  });
});
