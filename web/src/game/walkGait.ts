/**
 * Assistant walk gait: step deltas, sprites, and phase advance.
 * Sprites face right (exit). Mirror + reverse gait while walking left (dir<0).
 */
import { defaultAssetSpec } from '../spec';

const SPRITE = defaultAssetSpec.spriteIds;

/** -1 while opening (right→left); +1 returning to the right wing. */
export type WalkDir = -1 | 1;

const GAIT_PHASE_MASK = 3;
const GAIT_PHASE_COUNT = 4;

/** Rightward gait deltas (DOS / exit). Leftward entry runs the same table in reverse. */
export const STEP_DELTA = [3, 10, 0, 12] as const satisfies ReadonlyArray<number>;

export const STEP_SPRITE = [
  SPRITE.ASSIST_MOVE1,
  SPRITE.ASSIST_MOVE3,
  SPRITE.ASSIST_MOVE2,
  SPRITE.ASSIST_MOVE3,
] as const;

export const ASSIST_STAY_SPRITE = SPRITE.ASSIST_STAY;

export function nextGaitPhase(phase: number, dir: WalkDir): number {
  return dir > 0
    ? (phase + 1) & GAIT_PHASE_MASK
    : (phase + (GAIT_PHASE_COUNT - 1)) & GAIT_PHASE_MASK;
}

export function gaitStepDelta(phase: number): number {
  return STEP_DELTA[phase]!;
}

export function gaitStepSprite(phase: number): number {
  return STEP_SPRITE[phase]!;
}
