import { timestamp, type Timestamp } from '@game/game-core';

/** Source of the transition time of every command. */
export interface Clock {
  now(): Timestamp;
}

export const systemClock: Clock = {
  now: () => timestamp(Date.now()),
};
