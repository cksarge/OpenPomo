// Pure phase-transition logic, kept separate so it's easy to reason about
// (and unit-test) independent of storage/alarms/messaging plumbing.

import { PHASE } from "./constants.js";

/**
 * Given the phase that just ended, return the next phase and the updated
 * cycle count (number of work sessions completed in the current set).
 */
export function getNextPhase(phase, cycleCount, cyclesBeforeLongBreak) {
  if (phase === PHASE.WORK) {
    const newCount = cycleCount + 1;
    return newCount >= cyclesBeforeLongBreak
      ? { phase: PHASE.LONG_BREAK, cycleCount: newCount }
      : { phase: PHASE.REST, cycleCount: newCount };
  }
  if (phase === PHASE.REST) {
    return { phase: PHASE.WORK, cycleCount };
  }
  // LONG_BREAK finished: start a fresh set.
  return { phase: PHASE.WORK, cycleCount: 0 };
}
