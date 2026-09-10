/**
 * Player speech bubbles, binary choice lean, confirm, and money recount
 * (dpr:560-637 + DIFF #21 / #31).
 */
import { BACKBUF2, INFINITE, SCREEN_W, type AudioApi, type InputApi, type ScreenApi } from '../engine/types';
import { spokenCasing, type HostTts, type TtsRole } from '../engine/tts';
import { defaultAssetSpec } from '../spec';
import { DECISION_ANIM, liveSeat } from './constants';
import { MONEY_RECOUNT_TICK_MS, moneyRecountStride } from './moneyRecount';
import type { GameSeat } from './gameTypes';
import type { HudView, SpriteBox } from './svgHud';
import type { PlayersView } from './svgPlayers';

const SPRITE = defaultAssetSpec.spriteIds;

/** 8px font: half glyph width used to center bubble text. */
const FONT_HALF_PX = 4;
const BUBBLE_W = 84;
const BUBBLE_H = 39;
const BUBBLE_GAP = 4;
const BUBBLE_TEXT_ROW = 8;
const BUBBLE_TEXT_MID_X = 44;
const TRANSPARENT_INDEX = 2;
const NPC_BUBBLE_MS = 1000;
const DECISION_CENTER = 2;
const DECISION_LEAN_RIGHT = 4;
const SEAT_POSE_H = 83;
const SEAT_POSE_W = 99;

function centeredBubbleTextOfs(baseOfs: number, textLen: number): number {
  return baseOfs + BUBBLE_TEXT_ROW * SCREEN_W + BUBBLE_TEXT_MID_X - textLen * FONT_HALF_PX;
}

export interface PlayerPresentationHost {
  readonly screen: ScreenApi;
  readonly input: InputApi;
  readonly audio: AudioApi;
  readonly hud: HudView | undefined;
  readonly players: PlayersView | undefined;
  readonly tts: HostTts | undefined;
  readonly seats: readonly GameSeat[];
  readonly curPlayer: number;
  isHuman(seatIdx: number): boolean;
  useSvgPlayers(): boolean;
  spriteBox(seatIdx: number, poseWidth?: number): SpriteBox;
  talkSide(seatIdx: number): 'west' | 'east';
  paintSeatSprite(seatIdx: number, spriteId?: number | null): void;
  paintScore(seatIdx: number): void;
  syncHud(visible?: boolean): void;
  setMoneyRecount(
    show: { seat: number; score: number } | null,
    jitter: { seat: number; x: number; y: number } | null,
  ): void;
  currentPlayerVoice(): TtsRole;
  yakubovichSetSilent(): Promise<void>;
  delay(ms: number): Promise<void>;
  waitKey(timeoutMs: number): Promise<boolean>;
  random(n: number): number;
  len(text: string): number;
}

export function showPlayerBubble(host: PlayerPresentationHost, text: string): void {
  const hud = host.hud;
  if (hud) {
    hud.showTalk(host.spriteBox(host.curPlayer), text, host.talkSide(host.curPlayer));
    return;
  }
  const bubbleOfs = liveSeat(host.curPlayer).talkBubbleOfs;
  const s = host.screen;
  s.screenCopy(BUBBLE_W, BUBBLE_H, BACKBUF2, bubbleOfs);
  s.drawSprite(SPRITE.SPEECH_BUBBLE2, bubbleOfs, TRANSPARENT_INDEX);
  s.print(text, centeredBubbleTextOfs(bubbleOfs, host.len(text)), 0, 14, 8);
}

export function hidePlayerBubble(host: PlayerPresentationHost): void {
  if (host.hud) {
    host.hud.hideBubbles();
    return;
  }
  const bubbleOfs = liveSeat(host.curPlayer).talkBubbleOfs;
  host.screen.screenCopy(BUBBLE_W, BUBBLE_H, bubbleOfs, BACKBUF2);
}

/**
 * DIFF #21: every player replica is spoken (letter, drum/word, prize, box).
 * Bubble and TTS start together; we block on Promise.all until both finish.
 * DOS / DIFF #11: only NPC seats get a bubble (fixed 1 s), the human has none.
 */
export async function playerSay(
  host: PlayerPresentationHost,
  displayText: string,
  spokenText = displayText,
): Promise<void> {
  const spoken = spokenCasing(spokenText);
  if (spoken.length === 0) {
    return;
  }
  const speech = host.tts?.speak(spoken, host.currentPlayerVoice()) ?? null;
  const showBubble = !host.isHuman(host.curPlayer);
  const voiceDone = speech?.ended ?? Promise.resolve();
  const bubbleDone = showBubble
    ? (async () => {
        showPlayerBubble(host, displayText);
        await host.waitKey(NPC_BUBBLE_MS);
        hidePlayerBubble(host);
      })()
    : Promise.resolve();
  await Promise.all([voiceDone, bubbleDone]);
}

/**
 * dpr:589-637. Returns 0 (left option) or 1 (right option).
 * `forced` substitutes the NPC's random(2) when a deviation policy fixes
 * the answer (e.g. NPCs never take the prize) while keeping the full
 * save/restore + setSilent + speech-bubble tail of the original.
 */
export async function playerDecision(
  host: PlayerPresentationHost,
  label1: string,
  label2: string,
  phrase0: string,
  phrase1: string,
  forced?: number,
  opts?: { readonly deferSpeech?: boolean },
): Promise<number> {
  const s = host.screen;
  const { input } = host;
  const seatIdx = host.curPlayer;
  const { spriteOfs, talkBubbleOfs } = liveSeat(seatIdx);
  // Seat 1: the 99×83 pose blit covers the left cloud’s tail and leaves the
  // right one intact, so the pair looks vertically skewed. Sit both above the sprite.
  const pairOfs = seatIdx === 1 ? talkBubbleOfs - 20 * SCREEN_W : talkBubbleOfs;
  const rightBubble = pairOfs + BUBBLE_W + BUBBLE_GAP;

  const leftText = phrase0.length > 0 ? phrase0 : label1;
  const rightText = phrase1.length > 0 ? phrase1 : label2;
  const hud = host.hud;
  if (hud) {
    hud.showChoice(host.spriteBox(seatIdx, SEAT_POSE_W), leftText, rightText);
  } else {
    s.screenCopy(BUBBLE_W * 2 + BUBBLE_GAP, BUBBLE_H, BACKBUF2, pairOfs);
    s.drawSprite(SPRITE.SPEECH_BUBBLE2, pairOfs, TRANSPARENT_INDEX);
    s.print(leftText, centeredBubbleTextOfs(pairOfs, host.len(leftText)), 0, 14, 8);
    s.drawSprite(SPRITE.SPEECH_BUBBLE2, rightBubble, TRANSPARENT_INDEX);
    s.print(rightText, centeredBubbleTextOfs(rightBubble, host.len(rightText)), 0, 14, 8);
  }

  let result = 0;
  if (host.isHuman(seatIdx)) {
    const hand = input.hand;
    hand.min = 0;
    hand.max = DECISION_LEAN_RIGHT;
    hand.ofs = DECISION_LEAN_RIGHT;
    hand.step = DECISION_LEAN_RIGHT;
    let i = DECISION_CENTER;
    for (;;) {
      if (i > hand.ofs) {
        i -= 1;
      } else if (i < hand.ofs) {
        i += 1;
      }
      if (host.useSvgPlayers()) {
        host.players?.setSeat(seatIdx, DECISION_ANIM[i]!);
      } else {
        s.fillRect(spriteOfs, SEAT_POSE_H, SEAT_POSE_W, 7);
        s.drawSprite(DECISION_ANIM[i]!, spriteOfs, TRANSPARENT_INDEX);
      }
      await host.delay(100);
      if (hand.ofs !== 2 && input.pollKeyPressed()) {
        result = Math.floor(hand.ofs / FONT_HALF_PX);
        hand.ofs = DECISION_CENTER;
      }
      if (i === DECISION_CENTER && hand.ofs === DECISION_CENTER) {
        break;
      }
    }
    host.paintSeatSprite(seatIdx);
  } else {
    result = forced ?? host.random(2);
  }

  if (hud) {
    hud.hideBubbles();
  } else {
    s.screenCopy(BUBBLE_W * 2 + BUBBLE_GAP, BUBBLE_H, pairOfs, BACKBUF2);
  }
  await host.yakubovichSetSilent();
  if (!opts?.deferSpeech) {
    await playerSay(host, result === 0 ? phrase0 : phrase1);
  }
  return result;
}

/**
 * Single right-hand yellow choice (DIFF #31). Human confirms with Space;
 * the seat leans right, then speaks the phrase.
 */
export async function playerConfirm(
  host: PlayerPresentationHost,
  phrase: string,
  opts?: { readonly deferSpeech?: boolean },
): Promise<void> {
  const s = host.screen;
  const seatIdx = host.curPlayer;
  const { spriteOfs, talkBubbleOfs } = liveSeat(seatIdx);
  const bubbleOfs = (seatIdx === 1 ? talkBubbleOfs - 20 * SCREEN_W : talkBubbleOfs) + BUBBLE_W + BUBBLE_GAP;
  const hud = host.hud;
  if (hud) {
    hud.showSingleChoice(host.spriteBox(seatIdx, SEAT_POSE_W), phrase);
  } else {
    s.screenCopy(BUBBLE_W, BUBBLE_H, BACKBUF2, bubbleOfs);
    s.drawSprite(SPRITE.SPEECH_BUBBLE2, bubbleOfs, TRANSPARENT_INDEX);
    s.print(phrase, centeredBubbleTextOfs(bubbleOfs, host.len(phrase)), 0, 14, 8);
  }

  if (host.useSvgPlayers()) {
    host.players?.setSeat(seatIdx, DECISION_ANIM[DECISION_LEAN_RIGHT]!);
  } else {
    s.fillRect(spriteOfs, SEAT_POSE_H, SEAT_POSE_W, 7);
    s.drawSprite(DECISION_ANIM[DECISION_LEAN_RIGHT]!, spriteOfs, TRANSPARENT_INDEX);
  }

  if (host.isHuman(seatIdx)) {
    await host.waitKey(INFINITE);
  } else {
    await host.delay(900);
  }

  if (hud) {
    hud.hideBubbles();
  } else {
    s.screenCopy(BUBBLE_W, BUBBLE_H, bubbleOfs, BACKBUF2);
  }
  host.paintSeatSprite(seatIdx);
  await host.yakubovichSetSilent();
  if (!opts?.deferSpeech) {
    await playerSay(host, phrase);
  }
}

/** dpr:560-587. Skip the coin pile when the score did not go up. */
export async function updateMoney(
  host: PlayerPresentationHost,
  seatIdx: number,
  fromScore: number,
): Promise<void> {
  const seat = host.seats[seatIdx]!;
  if (seat.score <= fromScore) {
    host.paintScore(seatIdx);
    return;
  }
  const s = host.screen;
  const { moneyOfs } = liveSeat(seatIdx);
  const hud = host.hud;
  if (!hud) {
    s.fillRect(moneyOfs - 644, 30, 84, 7);
  }
  const delta = seat.score - fromScore;
  const stride = moneyRecountStride(delta);
  let shown = fromScore;
  if (hud) {
    host.setMoneyRecount({ seat: seatIdx, score: shown }, null);
    host.syncHud(true);
  }
  while (shown < seat.score) {
    shown = Math.min(seat.score, shown + stride);
    if (hud) {
      host.setMoneyRecount(
        { seat: seatIdx, score: shown },
        { seat: seatIdx, x: host.random(6) - 2, y: host.random(3) - 1 },
      );
      host.syncHud(true);
    } else {
      const coins = Math.min(stride, seat.score - (shown - stride));
      for (let c = 0; c < coins; c += 1) {
        s.drawSprite(SPRITE.MONEY, moneyOfs + host.random(7) * SCREEN_W - SCREEN_W + host.random(12) - 4, 1);
      }
    }
    const freq = host.random(10) + 50;
    await host.audio.sound(freq, MONEY_RECOUNT_TICK_MS, { audible: true });
  }
  host.paintScore(seatIdx);
}
