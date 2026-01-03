# Agentic Browser Automation System

The agentic system transforms Mimic from a step-by-step executor into an autonomous, goal-oriented agent that can plan, reason, act, and reflect to achieve browser automation goals.

## Architecture

The agentic system implements several key design patterns:

### 1. Planning Pattern
- **Purpose**: Breaks down high-level goals into actionable steps
- **Implementation**: `planner.ts`
- **Features**:
  - Goal decomposition into sequential steps
  - Dependency tracking between steps
  - Risk assessment and challenge identification
  - Plan refinement based on execution feedback

### 2. ReAct Pattern (Reasoning and Acting)
- **Purpose**: Combines logical reasoning with real-time action execution
- **Implementation**: `react.ts`
- **Features**:
  - Observes current state
  - Reasons about what to do next
  - Decides on specific actions
  - Considers alternatives
  - Validates action feasibility

### 3. Reflection Pattern
- **Purpose**: Evaluates actions and outcomes to improve future performance
- **Implementation**: `reflection.ts`
- **Features**:
  - Action-level reflection (did it work? what was learned?)
  - Progress-level reflection (are we on track? should we pivot?)
  - Learning extraction for future actions
  - Retry recommendations

### 4. Error Recovery
- **Purpose**: Handles failures and implements retry strategies
- **Implementation**: `recovery.ts`
- **Features**:
  - Error classification (transient, permanent, environment, logic)
  - Recovery strategy determination
  - Exponential backoff for retries
  - Alternative approach suggestions

## Core Components

### Agent Class (`agent.ts`)
The main orchestrator that:
- Manages agent state
- Coordinates planning, reasoning, acting, and reflection
- Executes actions using existing Mimic modules
- Tracks progress toward goals

### State Management (`types.ts`)
Tracks:
- Current page state (URL, title, available elements)
- Action history
- Errors and recovery attempts
- Goal progress

## Usage

### Basic Usage

```typescript
import { createAgenticMimic } from './agentic-mimic';
import { brains } from './test-utils';

const agenticMimic = createAgenticMimic({
  page,
  brains,
  enablePlanning: true,
  enableReflection: true,
  maxActions: 50,
});

// Execute a goal-oriented task
const result = await agenticMimic`
  Navigate to https://example.com
  Find and click the login button
  Fill in the login form
  Verify successful login
`;

console.log(`Success: ${result.success}`);
console.log(`Actions taken: ${result.actionsTaken}`);
```

### Advanced Configuration

```typescript
const agenticMimic = createAgenticMimic({
  page,
  brains,
  testInfo,
  // Agent configuration
  enablePlanning: true,      // Enable goal planning
  enableReflection: true,     // Enable action reflection
  maxActions: 50,            // Maximum actions before aborting
  maxRetries: 3,             // Maximum retries per action
  actionTimeout: 30000,       // Timeout per action (ms)
});
```

### Direct Agent Usage

```typescript
import { Agent } from './agentic';

const agent = new Agent({
  brain: brains,
  page,
  enablePlanning: true,
  enableReflection: true,
  maxActions: 50,
});

await agent.initialize();
const result = await agent.executeGoal('Navigate to example.com and login');

console.log(`Goal achieved: ${result.goalAchieved}`);
console.log(`Final state:`, agent.getState());
```

## Key Differences from Step-by-Step Mimic

| Feature | Step-by-Step Mimic | Agentic System |
|---------|-------------------|----------------|
| **Execution Model** | Sequential step execution | Goal-oriented autonomous execution |
| **Planning** | None (executes steps as given) | AI-powered plan generation |
| **Reasoning** | Per-step action classification | Continuous reasoning about next action |
| **Error Handling** | Fails on error | Recovers, retries, and adapts |
| **Reflection** | None | Evaluates actions and learns |
| **Adaptability** | Fixed sequence | Adapts based on state and outcomes |

## How It Works

1. **Planning Phase** (if enabled):
   - Analyzes the goal
   - Breaks it into steps with dependencies
   - Identifies challenges and prerequisites

2. **Execution Loop**:
   - **Observe**: Updates state from current page
   - **Reason**: Decides what action to take next
   - **Act**: Executes the action using Mimic modules
   - **Reflect**: Evaluates the action's effectiveness
   - **Recover**: Handles errors and retries if needed

3. **Progress Monitoring**:
   - Periodically reflects on overall progress
   - Suggests strategy pivots if needed
   - Tracks goal achievement

## Error Recovery

The system implements intelligent error recovery:

- **Transient Errors** (timeouts, loading): Automatic retry with exponential backoff
- **Environment Errors** (element not found): Retry with different selectors
- **Logic Errors** (invalid parameters): Skip and try alternative approach
- **Permanent Errors** (permission denied): Abort or pivot strategy

## Best Practices

1. **Clear Goals**: Write goals as clear, actionable statements
2. **Reasonable Limits**: Set appropriate `maxActions` based on complexity
3. **Enable Reflection**: Reflection improves performance over time
4. **Monitor Progress**: Check `result.finalState` for insights
5. **Error Handling**: Review `finalState.errors` for patterns

## Example Goals

```typescript
// Simple navigation
await agenticMimic`Navigate to https://example.com`;

// Multi-step workflow
await agenticMimic`
  Go to the login page
  Enter credentials
  Submit the form
  Verify dashboard is visible
`;

// Complex task with verification
await agenticMimic`
  Navigate to the product catalog
  Search for "laptop"
  Filter by price range
  Select the first result
  Add to cart
  Verify item is in cart
`;
```

## Integration with Existing Mimic

The agentic system uses all existing Mimic modules:
- `getBaseAction` - Action classification
- `getNavigationAction` / `executeNavigationAction` - Navigation
- `getClickAction` / `executeClickAction` - Clicking
- `getFormAction` / `executeFormAction` - Form interactions
- `captureTargets` / `buildSelectorForTarget` - Element selection

This ensures compatibility and reuses proven functionality while adding autonomous capabilities.
