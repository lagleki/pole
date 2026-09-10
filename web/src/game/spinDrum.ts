/**
 * Drum spin animation (TV timing via tvWheel helpers). Super-game uses the
 * tighter min/max turn span when `superMode` is set.
 */
import type { AudioApi } from '../engine/types';
import type { SfxId, SfxPlayOptions } from '../engine/sfx';
import type { WheelView } from './svgWheel';
import {
  spinEase,
  spinMilliturns,
  spinStepsFromMilliturns,
  spinTurnSpan,
  SPIN_DURATION_JITTER_MS,
  SPIN_DURATION_MS,
  SPIN_FRAME_MS,
  SPIN_MAX_TURNS,
  SPIN_MIN_TURNS,
  SPIN_SUPER_MAX_TURNS,
  SPIN_SUPER_MIN_TURNS,
  WHEEL_SECTOR_COUNT,
  WHEEL_STEP_DEG,
} from './tvWheel';

export interface SpinDrumHost {
  readonly audio: AudioApi;
  readonly audioBuf: Int16Array;
  readonly wheel: WheelView | undefined;
  playSfx(id: SfxId, options?: SfxPlayOptions): void;
  stopSfx(id?: SfxId): void;
  delay(ms: number): Promise<void>;
  random(n: number): number;
  /** Paint the settled drum (SVG + legacy seat-0 overlay). */
  drawFortuneWheel(sector: number): void;
  syncDebug(): void;
}

export interface SpinDrumResult {
  readonly curSector: number;
  readonly superSector?: number;
}

export async function spinDrum(
  host: SpinDrumHost,
  curSector: number,
  opts: { superMode: boolean },
): Promise<SpinDrumResult> {
  const sectorCount = host.wheel?.getSectorCount() ?? WHEEL_SECTOR_COUNT;
  const stepDeg = host.wheel?.getStepDeg() ?? WHEEL_STEP_DEG;
  const minTurns = opts.superMode ? SPIN_SUPER_MIN_TURNS : SPIN_MIN_TURNS;
  const maxTurns = opts.superMode ? SPIN_SUPER_MAX_TURNS : SPIN_MAX_TURNS;
  const milliturns = spinMilliturns(host.random(spinTurnSpan(minTurns, maxTurns) + 1), minTurns, maxTurns);
  const totalSteps = spinStepsFromMilliturns(milliturns, sectorCount);
  const turns = milliturns / 1000;
  const meanTurns = (SPIN_MIN_TURNS + SPIN_MAX_TURNS) / 2;
  const durationMs = Math.round(
    (SPIN_DURATION_MS + host.random(SPIN_DURATION_JITTER_MS)) * (turns / meanTurns),
  );
  const startDeg = -curSector * stepDeg;
  const deltaDeg = -totalSteps * stepDeg;
  host.playSfx('drumSpin', { loop: true });
  host.wheel?.setVisible(true);
  let elapsed = 0;
  while (elapsed < durationMs) {
    const u = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
    host.wheel?.setAngle(startDeg + deltaDeg * spinEase(u));
    const frame = Math.min(SPIN_FRAME_MS, durationMs - elapsed);
    await host.delay(frame);
    elapsed += frame;
  }
  const nextSector = (curSector + totalSteps) % sectorCount;
  host.drawFortuneWheel(nextSector);
  host.stopSfx('drumSpin');

  let k = 0;
  for (let n = 1; n <= 30; n += 1) {
    k = host.audio.pwm(host.audioBuf, k, 1000 - n * 30, Math.floor(n / 5) + Math.floor(n / 3));
  }
  await host.audio.playWav(host.audioBuf.subarray(0, k));
  host.syncDebug();

  if (opts.superMode) {
    return { curSector: nextSector, superSector: nextSector };
  }
  return { curSector: nextSector };
}

