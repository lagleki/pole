/**
 * Small scene-graph tween helpers.
 * WEB animations prefer progress 0..1 + pure pose functions over DOS blit loops.
 */
export type EasingFn = (t: number) => number;

export const easeLinear: EasingFn = (t) => t;

export interface AnimateOptions {
  /** Total wall time for the tween (ms). */
  readonly durationMs: number;
  /** Number of onUpdate samples inclusive of endpoints (default ~60fps). */
  readonly steps?: number;
  readonly easing?: EasingFn;
  readonly onUpdate: (t: number) => void | Promise<void>;
  readonly delay: (ms: number) => Promise<void>;
}

/**
 * Drive `onUpdate(t)` for t in [0, 1] over `durationMs`.
 * Final call is always t=1.
 */
export async function animate(opts: AnimateOptions): Promise<void> {
  const steps = Math.max(1, opts.steps ?? Math.max(1, Math.round(opts.durationMs / (1000 / 60))));
  const ease = opts.easing ?? easeLinear;
  const frameMs = opts.durationMs / steps;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    await opts.onUpdate(ease(u));
    if (i < steps && frameMs > 0) {
      await opts.delay(frameMs);
    }
  }
}

export interface AnimateFramesOptions {
  /** Exclusive upper bound: frames 0 .. frameCount-1. */
  readonly frameCount: number;
  /** Per-frame dwell after the pose is applied (may be 0). */
  readonly delayMs: (frame: number) => number;
  readonly onFrame: (frame: number) => void | Promise<void>;
  readonly delay: (ms: number) => Promise<void>;
}

/**
 * Discrete keyframe loop — use when DOS timing was an integer countdown with
 * a variable per-frame delay (e.g. box bring-in delay = 30 - frame).
 */
export async function animateFrames(opts: AnimateFramesOptions): Promise<void> {
  for (let frame = 0; frame < opts.frameCount; frame += 1) {
    await opts.onFrame(frame);
    const wait = opts.delayMs(frame);
    if (wait > 0) {
      await opts.delay(wait);
    }
  }
}
