/**
 * Host portrait mouth / idle / spoken lines (dpr:503-544 + DIFF #21/#24).
 * WEB: YakView scene graph only — canvas face keep-blit deleted.
 */
import type { AudioApi, ScreenApi } from '../engine/types';
import { hostSpeechText, type HostTts } from '../engine/tts';
import type { YakBody, YakEyes, YakView } from './svgYakubovich';

const MOUTH_OPEN_MS = 120;
const MOUTH_CLOSE_MS = 180;
const REPLY_BEAT_MS = 700;

export interface YakubovichHost {
  readonly screen: ScreenApi;
  readonly yak: YakView | undefined;
  readonly audio: AudioApi;
  readonly tts: HostTts | undefined;
  delay(ms: number): Promise<void>;
  waitKey(timeoutMs: number): Promise<boolean>;
  random(n: number): number;
}

function requireYak(host: YakubovichHost): YakView {
  if (!host.yak) {
    throw new Error('yak view required (SVG scene graph)');
  }
  return host.yak;
}

function setPose(
  host: YakubovichHost,
  body: YakBody,
  eyes: YakEyes,
  eyesHigh = false,
): void {
  requireYak(host).setPose(body, eyes, eyesHigh);
}

/** Studio rest pose: closed mouth, open eyes (same sprites as setSilent). */
export function yakubovichShowIdle(host: YakubovichHost): void {
  requireYak(host).showIdle();
}

/** dpr:503-509 */
export async function yakubovichSetSilent(host: YakubovichHost): Promise<void> {
  await host.audio.speechSound();
  yakubovichShowIdle(host);
}

/** Keep the jaw moving until `ended` resolves, then rest. */
export async function yakubovichMouthUntil(host: YakubovichHost, ended: Promise<void>): Promise<void> {
  let done = false;
  const mark = ended.then(() => {
    done = true;
  });

  setPose(host, 'active', 'close', true);
  while (!done) {
    setPose(host, 'passive', 'open', false);
    await host.delay(MOUTH_OPEN_MS);
    if (done) {
      break;
    }
    setPose(host, 'active', 'close', true);
    await host.delay(MOUTH_CLOSE_MS);
  }
  await mark;
  yakubovichShowIdle(host);
}

/** Mouth/eye cycle from DrawYakubovichTalk (dpr:511-544), without the bubble. */
export async function yakubovichMouthAnimation(host: YakubovichHost): Promise<void> {
  await host.audio.speechSound();
  setPose(host, 'passive', 'close', false);
  await host.delay(200);
  setPose(host, 'passive', 'open', false);
  await host.delay(150);
  setPose(host, 'passive', 'close', false);
  await host.delay(150);
  setPose(host, 'active', 'close', true);

  for (const _ of [0, 1, 2]) {
    await host.audio.speechSound();
    setPose(host, 'passive', 'open', false);
    await host.delay(host.random(2) * 200 + 100);
    setPose(host, 'active', 'close', true);
    await host.delay(host.random(2) * 50 + 100);
  }

  await host.audio.speechSound();
  yakubovichShowIdle(host);
}

/** dpr:511-544. DIFF #21: one spoken line (optional name + continuation). */
export async function yakubovichTalk(host: YakubovichHost, line1: string, line2 = ''): Promise<void> {
  const spoken = hostSpeechText(line1, line2);
  const speech = host.tts?.speak(spoken) ?? null;
  if (!speech) {
    await yakubovichMouthAnimation(host);
    yakubovichShowIdle(host);
    return;
  }
  await speech.started;
  await yakubovichMouthUntil(host, speech.ended);
  yakubovichShowIdle(host);
}

/** DIFF #24: beat after the player's answer, then the host reply. */
export async function yakubovichReply(host: YakubovichHost, line1: string, line2 = ''): Promise<void> {
  await host.waitKey(REPLY_BEAT_MS);
  await yakubovichTalk(host, line1, line2);
}
