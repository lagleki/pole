/**
 * Assistant card-open walk (dpr:1456-1480 + WEB path).
 * Enter from the RIGHT, open stops RIGHT→LEFT, exit back to the RIGHT.
 * SVG assist is mirrored when walking left (faceLeft); gait phases reverse when dir<0.
 * Mirror pivot uses ASSIST_STAY width (see svgAssist.ts).
 *
 * Stops are a modern left→right list (`AssistStop[]`); the walker pops from the end.
 * WEB: AssistView scene graph only — canvas keep-blit deleted.
 */
import { SCREEN_W, type AudioApi, type ScreenApi } from '../engine/types';
import type { SfxId } from '../engine/sfx';
import type { AssistView } from './svgAssist';
import { ASSIST_WALK_X0, ASSIST_WALK_X1, ASSIST_WALK_Y } from './svgStudio';
import type { AssistStop, AssistStopList } from './assistStops';
import {
  ASSIST_STAY_SPRITE,
  gaitStepDelta,
  gaitStepSprite,
  nextGaitPhase,
  type WalkDir,
} from './walkGait';

export {
  ASSIST_STAY_WIDTH,
  WORD_CELL_WIDTH,
  ASSIST_STAND_SHIFT,
  cellStandOfs,
  letterIndexAtAssist,
} from './boardLetters';

export type { AssistStop, AssistStopList } from './assistStops';
export {
  collectLetterHitStops,
  collectClosedCellStops,
  applyAssistStopsOpened,
  standOfsList,
} from './assistStops';

export type { WalkDir } from './walkGait';

/** Frame delay between gait steps (ms). */
const STEP_FRAME_MS = 50;
/** Default dwell at each opened card (ms). */
const DEFAULT_DWELL_MS = 1450;
/** Footstep pitch base + jitter range for audible walk ticks. */
const FOOTSTEP_FREQ_BASE = 1000;
const FOOTSTEP_FREQ_JITTER = 100;
const FOOTSTEP_DURATION = 7;

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

interface WalkState {
  walk: number;
  phase: number;
  dir: WalkDir;
  /**
   * Next stop to open while walking left: index into `stops` (rightmost first).
   * `-1` means all stops done / exiting.
   */
  nextIdx: number;
}

function frameOffset(x: number): number {
  return ASSIST_WALK_Y * SCREEN_W + x;
}

function requireAssist(host: AssistantWalkHost): AssistView {
  if (!host.assist) {
    throw new Error('assist view required (SVG scene graph)');
  }
  return host.assist;
}

function nextStopOfs(stops: AssistStopList, nextIdx: number): number | undefined {
  return nextIdx >= 0 ? stops[nextIdx]?.standOfs : undefined;
}

function paintPose(
  assist: AssistView,
  ofs: number,
  spriteId: number,
  dir: WalkDir,
): void {
  // Sprites face right (exit). Mirror + reverse gait while walking left.
  assist.sync(true, ofs, spriteId, dir < 0);
}

async function dwellAtStop(
  host: AssistantWalkHost,
  assist: AssistView,
  state: WalkState,
  stops: AssistStopList,
  openAtStop: (stop: AssistStop) => void,
  opts: AssistantWalkOptions | undefined,
  dwellMs: number,
): Promise<void> {
  const stop = stops[state.nextIdx];
  if (!stop) {
    state.nextIdx = -1;
    state.dir = 1;
    state.phase = 0;
    return;
  }
  const stopOfs = state.walk;
  paintPose(assist, stopOfs, ASSIST_STAY_SPRITE, state.dir);
  openAtStop(stop);
  state.nextIdx -= 1;
  paintPose(assist, stopOfs, ASSIST_STAY_SPRITE, state.dir);
  if (opts?.letterSting) {
    host.playSfx('letterCorrect');
  }
  await host.waitKey(dwellMs);
  if (state.nextIdx < 0) {
    state.dir = 1;
    state.phase = 0; // restart forward gait for the exit
  }
}

async function advanceGait(
  host: AssistantWalkHost,
  assist: AssistView,
  state: WalkState,
  leftEdge: number,
  rightEdge: number,
  stops: AssistStopList,
): Promise<'continue' | 'break' | 'ok'> {
  const nextPhase = nextGaitPhase(state.phase, state.dir);
  const nextStep = gaitStepDelta(nextPhase);
  const target = nextStopOfs(stops, state.nextIdx);

  if (state.dir < 0 && target !== undefined && state.walk - nextStep <= target) {
    state.walk = target;
    return 'continue';
  }
  if (state.dir > 0 && state.nextIdx < 0 && state.walk + nextStep >= rightEdge) {
    // Snap the last exit step onto the wing so we don't overshoot/jitter.
    state.walk = rightEdge;
    paintPose(assist, state.walk, ASSIST_STAY_SPRITE, state.dir);
    return 'break';
  }

  state.phase = nextPhase;
  state.walk += state.dir * gaitStepDelta(state.phase);

  if (state.dir < 0 && state.walk < leftEdge) {
    state.walk = leftEdge;
    if (state.nextIdx < 0) {
      state.dir = 1;
      state.phase = 0;
    }
  }
  if (state.dir > 0 && state.walk > rightEdge) {
    state.walk = rightEdge;
  }

  paintPose(assist, state.walk, gaitStepSprite(state.phase), state.dir);
  await host.audio.sound(
    host.random(FOOTSTEP_FREQ_JITTER) + FOOTSTEP_FREQ_BASE,
    FOOTSTEP_DURATION,
    { audible: true },
  );
  return 'ok';
}

/**
 * `stops` must list cards left→right; the walker opens from the rightmost
 * (`stops.at(-1)`) first while entering from the right wing.
 */
export async function assistantOpenWalk(
  host: AssistantWalkHost,
  stops: AssistStopList,
  openAtStop: (stop: AssistStop) => void,
  opts?: AssistantWalkOptions,
): Promise<void> {
  const assist = requireAssist(host);
  const leftEdge = frameOffset(ASSIST_WALK_X0);
  const rightEdge = frameOffset(ASSIST_WALK_X1);
  const dwellMs = opts?.dwellMs ?? DEFAULT_DWELL_MS;
  const state: WalkState = {
    walk: rightEdge,
    phase: 0,
    dir: -1,
    nextIdx: stops.length - 1,
  };

  try {
    for (;;) {
      const target = nextStopOfs(stops, state.nextIdx);
      const atStop =
        state.dir < 0 && target !== undefined && state.walk <= target;

      if (atStop) {
        state.walk = target;
        await dwellAtStop(host, assist, state, stops, openAtStop, opts, dwellMs);
      } else {
        const step = await advanceGait(host, assist, state, leftEdge, rightEdge, stops);
        if (step === 'continue') {
          continue;
        }
        if (step === 'break') {
          break;
        }
      }

      await host.delay(STEP_FRAME_MS);

      if (!(state.dir < 0 || state.walk < rightEdge)) {
        break;
      }
    }
  } finally {
    assist.sync(false, 0, ASSIST_STAY_SPRITE);
  }
}
