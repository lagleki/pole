/**
 * Between-round commercial plaque (dpr:1521-1554, DIFF #19 SVG overlay).
 */
import { BACKBUF, INFINITE, SCREEN_W, type Machine, type ScreenApi } from '../engine/types';
import type { SfxId, SfxPlayOptions } from '../engine/sfx';
import { defaultAssetSpec } from '../spec';
import { TOURNAMENT_ROUNDS } from './constants';
import type { GameContext, Scene } from './gameTypes';
import {
  ADWARE_COPY_W,
  ADWARE_DST_OFS,
  ADWARE_I0,
  ADWARE_LINES,
  ADWARE_MAX_H,
  ADWARE_SPRITE_OFS,
  ADWARE_SRC_OFS,
} from './svgAdware';
import {
  YAK_BASE_OFS,
  YAK_BODY_OFS,
  YAK_EYES_LOW_OFS,
} from './svgYakubovich';

const SPRITE = defaultAssetSpec.spriteIds;

/** Canvas backdrop copy before plaque text is composed (slightly above SRC). */
const ADWARE_BACKDROP_OFS = 0x1afd8;
const ADWARE_BACKDROP_H = 170;
/** Rise animation: pitch start / step and per-frame vertical scroll (2×SCREEN_W). */
const RISE_PITCH0 = 120;
const RISE_PITCH_STEP = 20;
const RISE_SCROLL_STEP = 2 * SCREEN_W;
/** Opaque draw for Yakubovich rest pose after the plaque dismisses. */
const YAK_OPAQUE = 16;

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

async function riseSvgPlaque(host: AdwareFlowHost): Promise<void> {
  const adware = host.ctx.adware!;
  let pitch = RISE_PITCH0;
  for (let i = ADWARE_I0; i >= 0; i -= 1) {
    adware.setRise(i);
    await host.m.audio.sound(pitch, 10);
    pitch += RISE_PITCH_STEP;
    await host.delay(riseDelayMs(i));
  }
  await host.waitKey(INFINITE);
  adware.setVisible(false);
  host.paintYakubovichStudio();
}

function composeCanvasPlaque(s: ScreenApi): void {
  s.screenCopy(ADWARE_COPY_W, ADWARE_BACKDROP_H, BACKBUF + ADWARE_BACKDROP_OFS, ADWARE_BACKDROP_OFS);
  s.drawSprite(SPRITE.ADWARE_BACKGROUND, BACKBUF + ADWARE_SPRITE_OFS, YAK_OPAQUE);
  for (const { text, ofs } of ADWARE_LINES) {
    s.print(text, BACKBUF + ofs, 14, 8, 8);
  }
}

async function riseCanvasPlaque(host: AdwareFlowHost): Promise<void> {
  const s = host.screen;
  let dst = ADWARE_DST_OFS;
  let pitch = RISE_PITCH0;
  for (let i = ADWARE_I0; i >= 0; i -= 1) {
    s.screenCopy(ADWARE_COPY_W, ADWARE_MAX_H - i - i, dst, BACKBUF + ADWARE_SRC_OFS);
    await host.m.audio.sound(pitch, 10);
    dst -= RISE_SCROLL_STEP;
    pitch += RISE_PITCH_STEP;
    await host.delay(riseDelayMs(i));
  }
  await host.waitKey(INFINITE);
  s.drawSprite(SPRITE.YAKUBOVICH_BASE, YAK_BASE_OFS, 7);
  s.drawSprite(SPRITE.YAKUBOVICH_PASSIVE, YAK_BODY_OFS, YAK_OPAQUE);
  s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, YAK_EYES_LOW_OFS, YAK_OPAQUE);
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

  if (host.ctx.adware) {
    await riseSvgPlaque(host);
    return;
  }

  composeCanvasPlaque(host.screen);
  await riseCanvasPlaque(host);
}
