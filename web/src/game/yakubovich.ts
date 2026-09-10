/**
 * Host portrait mouth / idle / spoken lines (dpr:503-544 + DIFF #21/#24).
 */
import { BACKBUF, type AudioApi, type ScreenApi } from "../engine/types";
import { hostSpeechText, type HostTts } from "../engine/tts";
import { defaultAssetSpec } from "../spec";
import type { YakView } from "./svgYakubovich";
import {
  YAK_BODY_OFS,
  YAK_EYES_HIGH_OFS,
  YAK_EYES_LOW_OFS,
} from "./svgYakubovich";

const SPRITE = defaultAssetSpec.spriteIds;

/** Face keep-blit region under the talking mouth (canvas path). */
const YAK_FACE_OFS = 0x164df;
const YAK_FACE_W = 161;
const YAK_FACE_H = 40;
const YAK_OPAQUE = 16;

const MOUTH_OPEN_MS = 120;
const MOUTH_CLOSE_MS = 180;
const REPLY_BEAT_MS = 700;

type YakMouth = "passive" | "active";
type YakEyes = "open" | "close";

export interface YakubovichHost {
  readonly screen: ScreenApi;
  readonly yak: YakView | undefined;
  readonly audio: AudioApi;
  readonly tts: HostTts | undefined;
  delay(ms: number): Promise<void>;
  waitKey(timeoutMs: number): Promise<boolean>;
  random(n: number): number;
}

function paintMouth(s: ScreenApi, mouth: YakMouth): void {
  const id = mouth === "active" ? SPRITE.YAKUBOVICH_ACTIVE : SPRITE.YAKUBOVICH_PASSIVE;
  s.drawSprite(id, YAK_BODY_OFS, YAK_OPAQUE);
}

function paintEyes(s: ScreenApi, eyes: YakEyes, high: boolean): void {
  const id = eyes === "open" ? SPRITE.YAKUBOVICH_EYES_OPEN : SPRITE.YAKUBOVICH_EYES_CLOSE;
  s.drawSprite(id, high ? YAK_EYES_HIGH_OFS : YAK_EYES_LOW_OFS, YAK_OPAQUE);
}

/** Full SVG pose, or canvas mouth+eyes. */
function setFullPose(
  host: YakubovichHost,
  mouth: YakMouth,
  eyes: YakEyes,
  opts?: { readonly eyesHigh?: boolean; readonly speakHint?: boolean },
): void {
  if (host.yak) {
    host.yak.setPose(mouth, eyes, opts?.speakHint ?? false);
    return;
  }
  paintMouth(host.screen, mouth);
  paintEyes(host.screen, eyes, opts?.eyesHigh ?? false);
}

/** Eyes-only canvas blink (preserves current mouth blit); SVG still gets a full pose. */
function setEyesOnly(
  host: YakubovichHost,
  eyes: YakEyes,
  mouthForSvg: YakMouth = "passive",
): void {
  if (host.yak) {
    host.yak.setPose(mouthForSvg, eyes, false);
    return;
  }
  paintEyes(host.screen, eyes, false);
}

function restoreFaceFromBackbuf(host: YakubovichHost): void {
  if (!host.yak) {
    host.screen.screenCopy(YAK_FACE_W, YAK_FACE_H, BACKBUF + YAK_FACE_OFS, YAK_FACE_OFS);
  }
}

function stashFaceToBackbuf(host: YakubovichHost): void {
  if (!host.yak) {
    host.screen.screenCopy(YAK_FACE_W, YAK_FACE_H, YAK_FACE_OFS, BACKBUF + YAK_FACE_OFS);
  }
}

/** Studio rest pose: closed mouth, open eyes (same sprites as setSilent). */
export function yakubovichShowIdle(host: YakubovichHost): void {
  if (host.yak) {
    host.yak.showIdle();
    return;
  }
  paintMouth(host.screen, "passive");
  paintEyes(host.screen, "open", false);
}

/** dpr:503-509 */
export async function yakubovichSetSilent(host: YakubovichHost): Promise<void> {
  stashFaceToBackbuf(host);
  await host.audio.speechSound();
  yakubovichShowIdle(host);
}

/** Keep the jaw moving until `ended` resolves, then close the eyes. */
export async function yakubovichMouthUntil(host: YakubovichHost, ended: Promise<void>): Promise<void> {
  let done = false;
  const mark = ended.then(() => {
    done = true;
  });

  setFullPose(host, "active", "close", { eyesHigh: true, speakHint: true });
  while (!done) {
    setFullPose(host, "passive", "open");
    await host.delay(MOUTH_OPEN_MS);
    if (done) {
      break;
    }
    setFullPose(host, "active", "close", { eyesHigh: true, speakHint: true });
    await host.delay(MOUTH_CLOSE_MS);
  }
  await mark;
  restoreFaceFromBackbuf(host);
  yakubovichShowIdle(host);
}

/** Mouth/eye cycle from DrawYakubovichTalk (dpr:511-544), without the bubble. */
export async function yakubovichMouthAnimation(host: YakubovichHost): Promise<void> {
  await host.audio.speechSound();
  setEyesOnly(host, "close");
  await host.delay(200);
  setEyesOnly(host, "open");
  await host.delay(150);
  setEyesOnly(host, "close");
  await host.delay(150);
  setFullPose(host, "active", "close", { eyesHigh: true, speakHint: true });

  for (let i = 2; i >= 0; i -= 1) {
    await host.audio.speechSound();
    setFullPose(host, "passive", "open");
    await host.delay(host.random(2) * 200 + 100);
    // Canvas: mouth only (eyes stay); SVG: full active/close pose.
    if (host.yak) {
      host.yak.setPose("active", "close", true);
    } else {
      paintMouth(host.screen, "active");
    }
    await host.delay(host.random(2) * 50 + 100);
  }

  restoreFaceFromBackbuf(host);
  await host.audio.speechSound();
  yakubovichShowIdle(host);
}

/** dpr:511-544. DIFF #21: one spoken line (optional name + continuation). */
export async function yakubovichTalk(host: YakubovichHost, line1: string, line2 = ""): Promise<void> {
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
export async function yakubovichReply(host: YakubovichHost, line1: string, line2 = ""): Promise<void> {
  await host.waitKey(REPLY_BEAT_MS);
  await yakubovichTalk(host, line1, line2);
}
