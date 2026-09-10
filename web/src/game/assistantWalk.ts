/**
 * Assistant card-open walk (dpr:1456-1480 + WEB path).
 * Enter from the RIGHT, open stops RIGHT→LEFT, exit back to the RIGHT.
 * SVG assist is mirrored when walking left (faceLeft); gait phases reverse when dir<0.
 * Mirror pivot uses ASSIST_STAY width (see svgAssist.ts).
 */
import { BACKBUF, SCREEN_W, type AudioApi, type ScreenApi } from '../engine/types';
import type { SfxId } from '../engine/sfx';
import { defaultAssetSpec } from '../spec';
import type { AssistView } from './svgAssist';
import { ASSIST_WALK_X0, ASSIST_WALK_X1, ASSIST_WALK_Y } from './svgStudio';

const SPRITE = defaultAssetSpec.spriteIds;

/** DIFF #23: ASSIST_STAY is 25px, word cells 16px. */
export const ASSIST_STAY_WIDTH = 25;
export const WORD_CELL_WIDTH = 16;
/** Stand pose midline aligned to cell center (not the cell's left edge). */
export const ASSIST_STAND_SHIFT = Math.floor((ASSIST_STAY_WIDTH - WORD_CELL_WIDTH) / 2);

/** Canvas blit: palette index treated as transparent (matches SVG ASSIST_TRANSPARENT). */
const TRANSPARENT_INDEX = 2;
/** Keep-blit footprint under the walking sprite (canvas path only). */
const KEEP_BLIT_W = 48;
const KEEP_BLIT_H = 90;
/** Frame delay between gait steps (ms). */
const STEP_FRAME_MS = 50;
/** Default dwell at each opened card (ms). */
const DEFAULT_DWELL_MS = 1450;
/** Footstep pitch base + jitter range for audible walk ticks. */
const FOOTSTEP_FREQ_BASE = 1000;
const FOOTSTEP_FREQ_JITTER = 100;
const FOOTSTEP_DURATION = 7;
/** Max stops slot (DOS 1-based table capacity). */
const ASSIST_POS_CAPACITY = 20;
/**
 * Unused DOS sentinel at assistPos[0] (dpr layout): row 0x19, x=639.
 * Callers only read indices 1..hits.
 */
const ASSIST_POS_SENTINEL = 0x19 * SCREEN_W + 639;

/** -1 while opening (right→left); +1 returning to the right wing. */
export type WalkDir = -1 | 1;

const GAIT_PHASE_MASK = 3;
const GAIT_PHASE_COUNT = 4;

/** Rightward gait deltas (DOS / exit). Leftward entry runs the same table in reverse. */
const STEP_DELTA = [3, 10, 0, 12] as const satisfies ReadonlyArray<number>;
const STEP_SPRITE = [
  SPRITE.ASSIST_MOVE1,
  SPRITE.ASSIST_MOVE3,
  SPRITE.ASSIST_MOVE2,
  SPRITE.ASSIST_MOVE3,
] as const;

export interface AssistantWalkHost {
  readonly screen: ScreenApi;
  readonly assist: AssistView | undefined;
  readonly audio: AudioApi;
  playSfx(id: SfxId): void;
  waitKey(timeoutMs: number): Promise<boolean>;
  delay(ms: number): Promise<void>;
  random(n: number): number;
}

export interface AssistantWalkOptions {
  readonly dwellMs?: number;
  readonly letterSting?: boolean;
}

export interface AssistStopTable {
  /** DOS-shaped: [0]=sentinel, [1..hits]=stops left→right (rightmost opened first). */
  readonly assistPos: number[];
  readonly hits: number;
}

interface WalkState {
  walk: number;
  phase: number;
  dir: WalkDir;
  /** Next stop index to open while walking left (hits … 1). */
  stopK: number;
}

function frameOffset(x: number): number {
  return ASSIST_WALK_Y * SCREEN_W + x;
}

function nextGaitPhase(phase: number, dir: WalkDir): number {
  return dir > 0 ? (phase + 1) & GAIT_PHASE_MASK : (phase + (GAIT_PHASE_COUNT - 1)) & GAIT_PHASE_MASK;
}

function cellStandOfs(wordPos: number, cellIndex: number): number {
  return wordPos + cellIndex * WORD_CELL_WIDTH - ASSIST_STAND_SHIFT;
}

function emptyAssistPos(): number[] {
  const assistPos: number[] = new Array(ASSIST_POS_CAPACITY).fill(0);
  assistPos[0] = ASSIST_POS_SENTINEL;
  return assistPos;
}

/** Paint stay/step on canvas (when no SVG assist) and sync the SVG overlay. */
function paintPose(
  host: AssistantWalkHost,
  ofs: number,
  spriteId: number,
  dir: WalkDir,
): void {
  if (!host.assist) {
    host.screen.drawSprite(spriteId, ofs, TRANSPARENT_INDEX);
  }
  // Sprites face right (exit). Mirror + reverse gait while walking left.
  host.assist?.sync(true, ofs, spriteId, dir < 0);
}

function restoreKeepBlit(host: AssistantWalkHost, blitOfs: number): void {
  if (!host.assist) {
    host.screen.screenCopy(KEEP_BLIT_W, KEEP_BLIT_H, blitOfs, BACKBUF + blitOfs);
  }
}

async function dwellAtStop(
  host: AssistantWalkHost,
  state: WalkState,
  openAtStop: (stopK: number) => void,
  opts: AssistantWalkOptions | undefined,
  dwellMs: number,
): Promise<void> {
  const stopOfs = state.walk;
  paintPose(host, stopOfs, SPRITE.ASSIST_STAY, state.dir);
  openAtStop(state.stopK);
  state.stopK -= 1;
  paintPose(host, stopOfs, SPRITE.ASSIST_STAY, state.dir);
  if (opts?.letterSting) {
    host.playSfx('letterCorrect');
  }
  await host.waitKey(dwellMs);
  if (state.stopK === 0) {
    state.dir = 1;
    state.phase = 0; // restart forward gait for the exit
  }
}

async function advanceGait(
  host: AssistantWalkHost,
  state: WalkState,
  leftEdge: number,
  rightEdge: number,
  assistPos: readonly number[],
): Promise<'continue' | 'break' | 'ok'> {
  const nextPhase = nextGaitPhase(state.phase, state.dir);
  const nextStep = STEP_DELTA[nextPhase];

  if (state.dir < 0 && state.stopK > 0 && state.walk - nextStep <= assistPos[state.stopK]) {
    state.walk = assistPos[state.stopK];
    return 'continue';
  }
  if (state.dir > 0 && state.stopK === 0 && state.walk + nextStep >= rightEdge) {
    // Snap the last exit step onto the wing so we don't overshoot/jitter.
    state.walk = rightEdge;
    paintPose(host, state.walk, SPRITE.ASSIST_STAY, state.dir);
    return 'break';
  }

  state.phase = nextPhase;
  state.walk += state.dir * STEP_DELTA[state.phase];

  if (state.dir < 0 && state.walk < leftEdge) {
    state.walk = leftEdge;
    if (state.stopK === 0) {
      state.dir = 1;
      state.phase = 0;
    }
  }
  if (state.dir > 0 && state.walk > rightEdge) {
    state.walk = rightEdge;
  }

  paintPose(host, state.walk, STEP_SPRITE[state.phase], state.dir);
  await host.audio.sound(
    host.random(FOOTSTEP_FREQ_JITTER) + FOOTSTEP_FREQ_BASE,
    FOOTSTEP_DURATION,
    { audible: true },
  );
  return 'ok';
}

/**
 * `assistPos[1..hits]` must list stops left→right so assistPos[hits] is the
 * rightmost card (opened first while walking left).
 */
export async function assistantOpenWalk(
  host: AssistantWalkHost,
  assistPos: readonly number[],
  hits: number,
  openAtStop: (stopK: number) => void,
  opts?: AssistantWalkOptions,
): Promise<void> {
  const leftEdge = frameOffset(ASSIST_WALK_X0);
  const rightEdge = frameOffset(ASSIST_WALK_X1);
  const dwellMs = opts?.dwellMs ?? DEFAULT_DWELL_MS;
  const state: WalkState = {
    walk: rightEdge,
    phase: 0,
    dir: -1,
    stopK: hits,
  };

  try {
    for (;;) {
      const atStop =
        state.dir < 0 && state.stopK > 0 && state.walk <= assistPos[state.stopK];

      if (atStop) {
        state.walk = assistPos[state.stopK];
        await dwellAtStop(host, state, openAtStop, opts, dwellMs);
      } else {
        const step = await advanceGait(host, state, leftEdge, rightEdge, assistPos);
        if (step === 'continue') {
          continue;
        }
        if (step === 'break') {
          break;
        }
      }

      // Keep-blit at the pose we just painted (post-step walk), matching DOS.
      await host.delay(STEP_FRAME_MS);
      restoreKeepBlit(host, state.walk);

      if (!(state.dir < 0 || state.walk < rightEdge)) {
        break;
      }
    }
  } finally {
    host.assist?.sync(false, 0, SPRITE.ASSIST_STAY);
  }
}

/**
 * Build 1-based assist stop offsets for each match of `letterByte` in the word.
 * Stops are filled left→right so assistPos[hits] is the rightmost match.
 * Marks matching indices in `opened` and returns hit count.
 */
export function collectLetterHits(args: {
  readonly guessedWord: Uint8Array;
  readonly opened: boolean[];
  readonly letterByte: number;
  readonly wordPos: number;
}): AssistStopTable {
  const { guessedWord, opened, letterByte, wordPos } = args;
  const assistPos = emptyAssistPos();
  let hits = 0;
  for (let j = 0; j < guessedWord.length; j += 1) {
    if (guessedWord[j] !== letterByte) {
      continue;
    }
    hits += 1;
    assistPos[hits] = cellStandOfs(wordPos, j);
    opened[j] = true;
  }
  return { assistPos, hits };
}

/** Remaining closed cells for the end-of-round / super-game full reveal. */
export function collectClosedCellStops(args: {
  readonly guessedWord: Uint8Array;
  readonly opened: boolean[];
  readonly wordPos: number;
}): AssistStopTable {
  const { guessedWord, opened, wordPos } = args;
  const assistPos = emptyAssistPos();
  let hits = 0;
  for (let j = 0; j < guessedWord.length; j += 1) {
    if (opened[j]) {
      continue;
    }
    hits += 1;
    assistPos[hits] = cellStandOfs(wordPos, j);
    opened[j] = true;
  }
  return { assistPos, hits };
}
