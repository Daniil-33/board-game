import type { StateView } from '@game/game-core';
import type { AnimationStep } from './animation';
/** The slice of the view the board draws. */
export type BoardView = Pick<StateView, 'owners' | 'board' | 'players' | 'positions' | 'jail' | 'eliminated' | 'houses' | 'mortgages'>;

/** What the client needs from a mounted board. */
export interface Board {
  refreshOwnership?(view: BoardView): void;
  setAssetSelection?(callback: ((index: number) => void) | null): void;
  setNames(nameOf: (playerId: string) => string): void;
  setViewer?(playerId: string | null): void;
  snap(view: BoardView, activeId: string | null): void;
  play(step: AnimationStep, speed: number): Promise<void>;
}
