/**
 * Between-round commercial plaque (dpr:1521-1554).
 * WEB: SVG overlay rise via keyframes (DIFF #19) — no canvas blit path.
 */
import { INFINITE, type Machine, type ScreenApi } from '../engine/types';
import type { SfxId, SfxPlayOptions } from '../engine/sfx';
import { TOURNAMENT_ROUNDS } from './constants';
import type { GameContext, Scene } from './gameTypes';
import { ADWARE_I0 } from './svgAdware';
import { animateFrames } from './tween';

/** Rise animation: pitch start / step matching DOS PWM ticks. */
const RISE_PITCH0 = 120;
const RISE_PITCH_STEP = 20;

export interface AdwareFlowHost {
  readonly screen: ScreenApi;
  readonly m: Machine;
  readonly ctx: GameContext;
  stage: number;
  setScene(scene: Scene): void;
  paintYakubovichStudio(): void;
  playSfx(id: SfxId, options?: SfxPlayOptions): void;
  yakubovichTalk(line1: string, line2?: string): Promise<void>;
  yakubovichSetSilent(): Promise<void>;
  delay(ms: number): Promise<void>;
  waitKey(timeoutMs: number): Promise<boolean>;
}

function riseDelayMs(i: number): number {
  return Math.floor(i / 2);
}

/**
 * Rise plaque from i=ADWARE_I0 → 0 (DOS countdown preserved as frames).
 * WEB uses scene-graph setRise — canvas screenCopy path deleted.
 */
async function risePlaque(host: AdwareFlowHost): Promise<void> {
  const adware = host.ctx.adware;
  if (!adware) {
    throw new Error('adware view required (SVG scene graph)');
  }
  const frameCount = ADWARE_I0 + 1;
  await animateFrames({
    frameCount,
    delayMs: (frame) => riseDelayMs(ADWARE_I0 - frame),
    onFrame: async (frame) => {
      const i = ADWARE_I0 - frame;
      adware.setRise(i);
      await host.m.audio.sound(RISE_PITCH0 + frame * RISE_PITCH_STEP, 10);
    },
    delay: (ms) => host.delay(ms),
  });
  await host.waitKey(INFINITE);
  adware.setVisible(false);
  host.paintYakubovichStudio();
}

/** dpr:1521-1554. DIFF #19: plaque is an SVG overlay over Yakubovich. */
export async function adware(host: AdwareFlowHost): Promise<void> {
  if (host.stage >= TOURNAMENT_ROUNDS - 1) {
    return;
  }
  host.setScene('adware');
  host.playSfx('commercial');
  host.playSfx('sponsor');
  await host.yakubovichSetSilent();
  await host.yakubovichTalk('Рекламная пауза!');
  await host.yakubovichSetSilent();
  await risePlaque(host);
}
