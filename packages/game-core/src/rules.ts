import type { CommandRegistry } from './registry.js';
import { createEngine, targetsGuard } from './registry.js';
import { resignationCommands } from './resignation.js';
import { lifecycleCommands } from './lifecycle.js';
import { setupCommands, setupTimeout } from './setup.js';
import { turnCommands, turnTimeout } from './turns.js';
import { pendingDeadlines, SETUP_ROLL_TARGET_KIND, TURN_TARGET_KIND } from './deadlines.js';

/**
 * `Timeout` resolves whichever deadline is pending. Its guard is built from
 * `pendingDeadlines`, so the host contract and the guard cannot drift.
 */
const timeoutCommands: CommandRegistry = {
  Timeout: {
    guard: targetsGuard([TURN_TARGET_KIND, SETUP_ROLL_TARGET_KIND], (s) => pendingDeadlines(s).map((d) => d.target)),
    allowedActors: ['system'],
    allowedPhases: ['setup', 'playing'],
    handle(state, command, context) {
      return state.phase === 'setup' ? setupTimeout(state, command, context) : turnTimeout(state, command, context);
    },
  },
};

/** Every command of this rules version. */
export const gameCommands: CommandRegistry = Object.freeze({
  ...lifecycleCommands,
  ...resignationCommands,
  ...setupCommands,
  ...turnCommands,
  ...timeoutCommands,
});

/** The default engine for this rules version. */
export const gameEngine = createEngine(gameCommands);
