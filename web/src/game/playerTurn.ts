/**
 * Player turn orchestration: box game, spin-sector handling, letter pick/open,
 * word solve, prize ceremony, seat pass (dpr:1120-1514 + DIFF #26/#30).
 */
import { decodeCp866 } from '../encoding/cp866';
import { BACKBUF, INFINITE, SCREEN_W, type Machine, type ScreenApi } from '../engine/types';
import type { SfxId, SfxPlayOptions } from '../engine/sfx';
import { defaultAssetSpec } from '../spec';
import { liveSeat, MONEY_VALUES, PRIZES } from './constants';
import type { GameContext, GameSeat, Scene } from './gameTypes';
import type { GameProgressSave } from './persist';
import {
  letterAwardFromResume,
  type AwardKind,
  type LetterAward,
  type TurnOutcome,
} from './letterAward';
import { letterReplica } from './playerVoice';
import {
  ASSIST_STAND_SHIFT,
  WORD_CELL_WIDTH,
  collectClosedCellStops,
  collectLetterHits,
  type AssistantWalkOptions,
} from './assistantWalk';
import {
  applyLetterScore,
  firstAvailableLetter,
  nearestAvailableLetter,
  npcPickLetterIndex,
} from './roundWord';
import { boxBringIn, boxClosedPair, boxReveal } from './svgBoxes';
import { WHEEL_SECTORS } from './tvWheel';
import type { BoardWordCell } from './svgBoard';

const SPRITE = defaultAssetSpec.spriteIds;

/** Alphabet strip row (dpr / DIFF #19). */
const ALPHA_ROW_Y = 0x14c;
const ALPHA_CELL_W = 20;
const ALPHA_CELL_H = 18;
const ALPHA_USED = 0x20;
const CP866_A = 0x80;
const FONT_HALF_PX = 4;
const OPEN_LETTER_INK_DY = 11;
const OPEN_LETTER_GLYPH_DX = 4;
const OPEN_LETTER_GLYPH_DY = 2;
const OPEN_LETTER_FILL_W = 19;
const OPEN_LETTER_FILL_H = 15;
const OPEN_LETTER_DWELL_MS = 1450;
const REVEAL_REMAINING_DWELL_MS = 450;
const HOST_CONFIRM_BEAT_MS = 1000;


export interface PlayerTurnHost {
  readonly screen: ScreenApi;
  readonly m: Machine;
  readonly ctx: GameContext;
  readonly seats: GameSeat[];
  readonly available: Uint8Array;
  readonly audioBuf: Int16Array;
  curPlayer: number;
  curSector: number;
  winner: number;
  stage: number;
  movesForBox: number;
  guessedWord: Uint8Array;
  remaindLetters: number;
  wordPos: number;
  opened: boolean[];
  supergameActive: boolean;
  resumeAfterSpin: boolean;
  resumeAtLetterPick: { awardKind: AwardKind; awardUnit: number } | null;
  resumeAtLetterOpen: {
    awardKind: AwardKind;
    awardUnit: number;
    letterIdx: number;
    plusPosition: number;
  } | null;
  setScene(scene: Scene): void;
  persistCheckpoint(checkpoint: GameProgressSave['checkpoint'], award?: LetterAward, pick?: { letterIdx: number; plusPosition?: number }): void;
  isHuman(seatIdx: number): boolean;
  playerName(seatIdx: number): string;
  useSvgPlayers(): boolean;
  paintSeatSprite(seatIdx: number, spriteId?: number | null): void;
  paintAlphabetRow(): void;
  paintWordBoard(): void;
  drawFortuneWheel(a: number): void;
  hideWheel(): void;
  syncBoard(visible?: boolean, revealedDuringWalk?: Set<number>, openBeforeWalk?: Set<number>): void;
  syncDebug(): void;
  wordBoardCells(entryBytes?: Uint8Array, revealedDuringWalk?: Set<number>, openBeforeWalk?: Set<number>): BoardWordCell[];
  letterIndexAtAssist(assistOfs: number): number;
  snapshotRoundToBackbuf(): void;
  inSupergameSolve(): boolean;
  spinWheel(): Promise<void>;
  assistantOpenWalk(
    assistPos: readonly number[],
    hits: number,
    openAtStop: (stopK: number) => void,
    opts?: AssistantWalkOptions,
  ): Promise<void>;
  playSfx(id: SfxId, options?: SfxPlayOptions): void;
  playerSay(displayText: string, spokenText?: string): Promise<void>;
  playerDecision(label1: string, label2: string, phrase0: string, phrase1: string, forced?: number, opts?: { deferSpeech?: boolean }): Promise<number>;
  updateMoney(seatIdx: number, fromScore: number): Promise<void>;
  yakubovichTalk(line1: string, line2?: string): Promise<void>;
  yakubovichReply(line1: string, line2?: string): Promise<void>;
  yakubovichSetSilent(): Promise<void>;
  delay(ms: number): Promise<void>;
  waitKey(timeoutMs: number): Promise<boolean>;
  random(n: number): number;
  len(text: string): number;
}


/** Canvas path: paint a revealed letter under the assistant stand pose. */
function paintCanvasOpenedLetter(
  s: ScreenApi,
  stopOfs: number,
  letterChar: string,
): void {
  const f = BACKBUF + stopOfs + ASSIST_STAND_SHIFT + OPEN_LETTER_INK_DY * SCREEN_W;
  s.fillRect(f, OPEN_LETTER_FILL_W, OPEN_LETTER_FILL_H, 7);
  s.print(letterChar, f + OPEN_LETTER_GLYPH_DX + OPEN_LETTER_GLYPH_DY * SCREEN_W, 0, 14, 8);
  s.screenCopy(OPEN_LETTER_FILL_H, OPEN_LETTER_FILL_W, f - BACKBUF, f);
}

function collectOpenedBeforeWalk(opened: readonly boolean[]): Set<number> {
  const openBeforeWalk = new Set<number>();
  for (let j = 0; j < opened.length; j += 1) {
    if (opened[j]) {
      openBeforeWalk.add(j);
    }
  }
  return openBeforeWalk;
}

/** Blank a used alphabet tile cell. */
export function clearAlphabetCell(host: PlayerTurnHost, letterIdx: number): void {
  if (host.ctx.alphabet) {
    host.ctx.alphabet.setVanishFrame(letterIdx, 3);
    return;
  }
  host.screen.fillRect(ALPHA_ROW_Y * SCREEN_W + letterIdx * ALPHA_CELL_W, ALPHA_CELL_H, 19, 7);
}

/** dpr:1410-1424 — lift the used letter off the alphabet row. */
export async function vanishAlphabetTile(host: PlayerTurnHost, letterIdx: number): Promise<void> {
  const s = host.screen;
  const cell = ALPHA_ROW_Y * SCREEN_W + letterIdx * ALPHA_CELL_W;
  const svg = host.ctx.alphabet;
  for (let i = 0; i <= 3; i += 1) {
    if (svg) {
      svg.setVanishFrame(letterIdx, i);
    } else if (i < 3) {
      s.drawSprite(SPRITE.LETTER_BACK1 + i, cell, 16);
    } else {
      s.fillRect(cell, ALPHA_CELL_H, 19, 7);
    }
    let k = 0;
    for (let j = 1; j <= 10; j += 1) {
      k = host.m.audio.pwm(host.audioBuf, k, i * 100 + j * 10 + 50, 1);
      k = host.m.audio.pwm(host.audioBuf, k, 0, Math.floor(j / 5) + i * 4);
    }
    await host.m.audio.playWav(host.audioBuf.subarray(0, k));
  }
}

/** dpr:1125-1189. DOS: offered to human seats only (deviation #5). */
export async function boxGame(host: PlayerTurnHost): Promise<void> {
  host.setScene('box-game');
  const s = host.screen;
  const seat = host.seats[host.curPlayer];
  const { talkBubbleOfs } = liveSeat(host.curPlayer);
  const areaOfs = talkBubbleOfs - 60 * SCREEN_W - 32;

  await host.yakubovichTalk('Три правильно угаданные буквы дают вам право на две шкатулки. Две шкатулки в студию!');
  const boxes = host.ctx.boxes;
  if (!boxes) {
    s.screenCopy(104, 121, BACKBUF + areaOfs, areaOfs);
  }

  let k = 61;
  let j = talkBubbleOfs + 60 * SCREEN_W;
  for (let i = 30; i >= 0; i -= 1) {
    await host.m.audio.sound(1000 - i * 20, 10, { audible: true });
    if (boxes) {
      boxes.show(boxBringIn(talkBubbleOfs, 30 - i));
    } else {
      s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
      s.drawSprite(SPRITE.BOX_OPENED, j - 46 * SCREEN_W - 32, 7);
      s.drawSprite(SPRITE.BOX_OPENED, j - 46 * SCREEN_W + 24, 7);
      s.drawSprite(SPRITE.BOX_MONEY, j - 60 * SCREEN_W + 26, 7);
      s.screenCopy(104, k, talkBubbleOfs - 32, BACKBUF + talkBubbleOfs - 32);
      k -= 2;
      j -= 1280;
    }
    await host.delay(i);
  }
  await host.waitKey(5000);

  if (!boxes) {
    s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
  }
  await host.m.audio.sound(1000, 10, { audible: true });
  if (boxes) {
    boxes.show(boxClosedPair(talkBubbleOfs, false).slice(0, 1));
  } else {
    s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 41 * SCREEN_W - 32, 7);
  }
  await host.m.audio.sound(100, 10, { audible: true });
  if (boxes) {
    boxes.show(boxClosedPair(talkBubbleOfs, false));
  } else {
    s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 41 * SCREEN_W + 24, 7);
  }
  await host.m.audio.sound(500, 10, { audible: true });
  await host.waitKey(2000);

  k = host.random(20) + 10;
  for (let i = k; i >= 0; i -= 1) {
    await host.m.audio.sound(host.random(100) + 50, 10, { audible: true });
    await host.delay(50);
    if (boxes) {
      boxes.show(boxClosedPair(talkBubbleOfs, (i & 1) !== 0));
    } else {
      s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
      if ((i & 1) === 0) {
        s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 41 * SCREEN_W - 32, 7);
        s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 41 * SCREEN_W + 24, 7);
      } else {
        s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 36 * SCREEN_W - 6, 7);
        s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 46 * SCREEN_W + 4, 7);
      }
    }
  }
  await host.yakubovichSetSilent();
  await host.yakubovichTalk('Какую вам шкатулку? Левую-правую, правую-левую?');
  const choice = await host.playerDecision('', '', 'Левая', 'Правая');
  await host.yakubovichSetSilent();
  k &= 1;
  if (boxes) {
    boxes.show(boxReveal(talkBubbleOfs, k === 1));
  } else {
    s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
    s.drawSprite(SPRITE.BOX_OPENED, talkBubbleOfs - 46 * SCREEN_W - 32, 7);
    s.drawSprite(SPRITE.BOX_OPENED, talkBubbleOfs - 46 * SCREEN_W + 24, 7);
    s.drawSprite(SPRITE.BOX_MONEY, talkBubbleOfs - 60 * SCREEN_W - 30 + 56 * k, 7);
  }
  if (choice === k) {
    host.playSfx('boxMoney');
  await host.yakubovichReply('Браво!!! Вы отгадали!');
    const before = seat.score;
    // DIFF #29: TV-scale purse; DOS awarded 100.
    seat.score += 1000;
    await host.yakubovichSetSilent();
    if (boxes) {
      boxes.setVisible(false);
    } else {
      s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
    }
    await host.updateMoney(host.curPlayer, before);
  } else {
    host.playSfx('boxEmpty');
    await host.yakubovichReply('Увы! Эта шкатулка пуста!');
    await host.yakubovichSetSilent();
    if (boxes) {
      boxes.setVisible(false);
    } else {
      s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
    }
    await host.updateMoney(host.curPlayer, seat.score);
  }
  host.movesForBox = 0;
}

/** dpr:1196-1224. Returns 'won' | 'removed'. */
export async function tellWord(host: PlayerTurnHost): Promise<'won' | 'removed'> {
  host.setScene('word-solve');
  const s = host.screen;
  const { input } = host.m;

  const maxLen = host.guessedWord.length;
  const entry = input.beginTextEntry(maxLen, host.wordPos + 13 * SCREEN_W + 4, 16);
  const k = maxLen * WORD_CELL_WIDTH;
  const board = host.ctx.board;
  if (board) {
    const pollEntry = window.setInterval(() => {
      board.setWordBoard(host.wordPos, host.wordBoardCells(new Uint8Array(entry.bytes)));
    }, 50);
    board.setWordBoard(host.wordPos, host.wordBoardCells(new Uint8Array(entry.bytes)));
    await input.waitEnter(INFINITE);
    window.clearInterval(pollEntry);
    input.endTextEntry();
    board.setWordBoard(host.wordPos, host.wordBoardCells());
  } else {
    s.screenCopy(k, 31, BACKBUF + host.wordPos, host.wordPos);
    let j = entry.ofs - 2 * SCREEN_W - 4;
    for (let i = maxLen; i >= 1; i -= 1) {
      s.fillRect(j, 19, 14, 7);
      j += 16;
    }
    await input.waitEnter(INFINITE);
    input.endTextEntry();
  }

  const typed = new Uint8Array(entry.bytes);
  const match = typed.length === host.guessedWord.length
    && typed.every((b, idx) => b === host.guessedWord[idx]);
  if (match) {
    await concludeCorrectWordGuess(host);
    return 'won';
  }
  if (!host.ctx.board) {
    s.screenCopy(k, 31, host.wordPos, BACKBUF + host.wordPos);
  }
  host.paintWordBoard();
  host.playSfx(host.inSupergameSolve() ? 'wordWrongSuper' : 'wordWrong');
  await host.yakubovichReply('Неправильно! Вы покидаете игру!');
  removePlayer(host);
  return 'removed';
}

/**
 * Whole-word win: host says «<слово>, ну конечно!» immediately while the
 * assistant walks out and flips every still-closed cell (DIFF #24 carve-out).
 */
export async function concludeCorrectWordGuess(host: PlayerTurnHost): Promise<void> {
  host.playSfx('wordCorrect');
  await Promise.all([
    // Two lines so spokenCasing title-cases the ALL-CAPS bank word (a single
    // `"WORD. Ну конечно!"` string stays shouty and TTS spells letters).
    host.yakubovichTalk(decodeCp866(host.guessedWord), 'Ну конечно!'),
    assistantRevealRemainingLetters(host, { leadInMs: 0 }),
  ]);
  await host.yakubovichSetSilent();
}

/** dpr:1352-1358 */
export function removePlayer(host: PlayerTurnHost): void {
  const s = host.screen;
  const layout = liveSeat(host.curPlayer);
  host.seats[host.curPlayer].spriteId = null;
  host.seats[host.curPlayer].nameBytes = new Uint8Array(0);
  if (!host.ctx.hud) {
    s.fillRect(layout.moneyOfs - 644, 30, 84, 7);
  }
  if (host.useSvgPlayers()) {
    host.paintSeatSprite(host.curPlayer, null);
  } else {
    s.fillRect(layout.spriteOfs, 83, 87, 7);
  }
  if (!host.ctx.hud) {
    s.fillRect(layout.labelOfs - 641, 30, 110, 7);
  }
  host.drawFortuneWheel(host.curSector);
  host.syncDebug();
}

/**
 * dpr:1265-1291 (ПЛЮС) — pick a POSITION in the word. Returns the 1-based
 * position n; the letter index is derived from the word byte there.
 */
export async function pickPlusPosition(host: PlayerTurnHost): Promise<number> {
  host.setScene('letter-pick');
  const s = host.screen;
  const { input } = host.m;

  if (!host.isHuman(host.curPlayer)) {
    let n: number;
    do {
      n = host.random(host.guessedWord.length) + 1;
    } while (host.available[host.guessedWord[n - 1] - CP866_A] === ALPHA_USED);
    return n;
  }

  if (!host.ctx.hand) {
    s.screenCopy(SCREEN_W, 60, BACKBUF + 0x320 * 8, 0x320 * 8);
  }
  const hand = input.hand;
  hand.step = 16;
  hand.ofs = host.wordPos - 13 * SCREEN_W;
  hand.min = hand.ofs;
  hand.max = hand.ofs + host.guessedWord.length * WORD_CELL_WIDTH - WORD_CELL_WIDTH;
  hand.prev = 12 * SCREEN_W + 0xc8;
  let n = 1;
  const svgHand = host.ctx.hand;
  for (;;) {
    if (!svgHand) {
      s.restoreBehind();
      s.saveBehind(hand.ofs, 15, 26);
      s.drawSprite(SPRITE.HAND, hand.ofs, 2);
    }
    n = Math.floor((hand.ofs - hand.min + WORD_CELL_WIDTH) / WORD_CELL_WIDTH);
    const letterIdx = host.guessedWord[n - 1] - CP866_A;
    if (input.pollKeyPressed()) {
      if (host.available[letterIdx] === ALPHA_USED) {
        await host.m.audio.sound(1000, 32);
      } else {
        break;
      }
    }
    // WEB: the original busy-waits here; yield so the browser can deliver input.
    await host.delay(10);
  }
  if (!svgHand) {
    s.restoreBehind();
  }
  hand.step = 0;
  return n;
}

/** dpr:1366-1396 — pick a letter from the alphabet row. Returns letter index 0..31. */
export async function pickLetter(host: PlayerTurnHost): Promise<number> {
  host.setScene('letter-pick');
  const s = host.screen;
  const { input } = host.m;
  if (!host.ctx.hand) {
    s.screenCopy(SCREEN_W, 60, BACKBUF + 0x59b0 * 8, 0x59b0 * 8);
  }

  if (host.isHuman(host.curPlayer)) {
    const hand = input.hand;
    const alphaMin = 0x13a * SCREEN_W;
    hand.step = 20;
    hand.min = alphaMin;
    hand.max = alphaMin + 31 * 20;

    // Start on the first available (non-used) letter instead of always А.
    const startIdx = firstAvailableLetter(host.available);
    hand.ofs = alphaMin + startIdx * 20;
    // prev == ofs on first frame so the initial screenCopy is a no-op.
    hand.prev = hand.ofs;

    let i = startIdx;
    for (;;) {
      // If input.ts moved us onto a used cell, jump to the nearest available
      // in the travel direction.
      let idx = Math.floor((hand.ofs - hand.min) / 20);
      if (host.available[idx] === ALPHA_USED) {
        const dir: 1 | -1 = hand.ofs > hand.prev ? 1 : -1;
        const next = nearestAvailableLetter(host.available, idx, dir);
        if (next === null) {
          break; // No available letter — should not happen.
        }
        hand.prev = hand.ofs;
        hand.ofs = hand.min + next * 20;
        idx = next;
      }
      i = idx;
      if (!host.ctx.hand) {
        s.restoreBehind();
        s.saveBehind(hand.ofs, 15, 26);
        s.drawSprite(SPRITE.HAND, hand.ofs, 2);
      }
      if (input.pollKeyPressed()) {
        if (!host.ctx.hand) {
          s.restoreBehind();
        }
        hand.step = 0;
        clearAlphabetCell(host, i);
        return i;
      }
      // WEB: yield (original busy-loop).
      await host.delay(10);
    }
  }

  // dpr:1389-1396 — the original NPC heuristic. Point at the tile; speech is in openLetter.
  const i = npcPickLetterIndex(
    host.available,
    host.guessedWord,
    host.remaindLetters,
    host.stage,
    (n) => host.random(n),
  );
  host.m.input.hand.step = 0;
  clearAlphabetCell(host, i);
  return i;
}

/**
 * dpr:1398-1497 — open the chosen letter. `letterIdx` 0..31; `n` is the
 * 1-based word position for the ПЛЮС sector, else 0. DIFF #26: TV scoring
 * adds unit×hits, doubles, or leaves the score unchanged.
 */
export async function openLetter(host: PlayerTurnHost, 
  letterIdx: number,
  n: number,
  award: LetterAward,
): Promise<boolean> {
  host.setScene('letter-open');
  const s = host.screen;
  const seat = host.seats[host.curPlayer];
  const letterByte = host.available[letterIdx];
  const letterChar = decodeCp866(new Uint8Array([letterByte]));
  host.available[letterIdx] = ALPHA_USED;
  host.syncDebug();

  await vanishAlphabetTile(host, letterIdx);
  // Redraw the full alphabet row so no artefacts remain on the layers below
  // (sprites, name plates) after the tile animation clears the bottom strip.
  host.paintAlphabetRow();
  const replica = letterReplica(letterChar, n);
  await host.playerSay(replica.display, replica.spoken);
  await host.yakubovichSetSilent();

  // Count matches and assistant stop positions (dpr:1427-1437).
  const openBeforeWalk = collectOpenedBeforeWalk(host.opened);
  // DIFF #23: ASSIST_STAY is 25px, cells 16px. Walk to the stand pose whose
  // midline matches the cell center (not the cell's left edge).
  // Stops are filled left→right so assistPos[hits] is the rightmost match
  // (opened first when she walks in from the right).
  const { assistPos, hits } = collectLetterHits({
    guessedWord: host.guessedWord,
    opened: host.opened,
    letterByte,
    wordPos: host.wordPos,
  });
  host.remaindLetters -= hits;
  host.syncDebug();

  if (hits === 0) {
    host.playSfx('letterWrong');
    await host.yakubovichReply('Увы, такой буквы нет!');
    return false;
  }

  if (n === 0) {
    await host.yakubovichTalk('И в этом слове есть такая буква! Откройте!');
  }
  host.snapshotRoundToBackbuf();

  // WEB: beat after the host confirms, then the assistant leaves the wings.
  await host.delay(HOST_CONFIRM_BEAT_MS);

  // Assistant walk (dpr:1456-1480). WEB: enter right, open R→L, exit right; sting per flip.
  const revealed = new Set<number>();
  await host.assistantOpenWalk(assistPos, hits, (stopK) => {
    const stopOfs = assistPos[stopK];
    if (host.ctx.board) {
      revealed.add(host.letterIndexAtAssist(stopOfs));
      host.syncBoard(true, revealed, openBeforeWalk);
    } else {
      paintCanvasOpenedLetter(s, stopOfs, letterChar);
    }
  }, { dwellMs: OPEN_LETTER_DWELL_MS, letterSting: true });

  let k2 = 0;
  for (let i = 0x64; i >= 20; i -= 1) {
    k2 = host.m.audio.pwm(host.audioBuf, k2, i, Math.floor((0x64 - i) / 10));
    k2 = host.m.audio.pwm(host.audioBuf, k2, 0, 1);
  }
  await host.m.audio.playWav(host.audioBuf.subarray(0, k2), { audible: true });

  const scoreBefore = seat.score;
  if (!host.supergameActive) {
    seat.score = applyLetterScore(seat.score, award, hits);
    // Плюс / keep: score unchanged — do not restack the coin pile.
    if (award.kind !== 'keep') {
      await host.updateMoney(host.curPlayer, scoreBefore);
    }
  }
  host.syncDebug();
  return true;
}

/** dpr:1300-1359 — the ПРИЗ sector ceremony (human only under DOS policy). */
export async function prizeCeremony(host: PlayerTurnHost): Promise<void> {
  host.setScene('prize');
  host.hideWheel();
  host.playSfx('prizesStudio');
  host.playSfx('autoWin');
  host.playSfx('automobileYell');
  const s = host.screen;
  const seat = host.seats[host.curPlayer];
  const layout = liveSeat(host.curPlayer);

  s.screenCopy(SCREEN_W, 350, BACKBUF, 0);
  s.fillRect(0, 350, SCREEN_W, 7);
  s.drawSprite(SPRITE.LOGO_POLE, 10 + 10 * SCREEN_W, 7);
  s.drawSprite(SPRITE.LOGO_CHUDES, 0xc8 + 10 * SCREEN_W, 7);
  s.drawSprite(SPRITE.YAKUBOVICH_BASE, 0x1e0 + 0xac * SCREEN_W, 7);
  s.drawSprite(SPRITE.YAKUBOVICH_PASSIVE, 0x1ff + 0xad * SCREEN_W, 16);
  s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, 0x214 + 0xd1 * SCREEN_W, 16);
  if (seat.spriteId !== null) {
    s.drawSprite(seat.spriteId, layout.spriteOfs, 2);
  }

  let i = 3;
  let j = 100;
  for (;;) {
    await host.yakubovichTalk(`Приз или ${MONEY_VALUES[i]} рублей?`);
    const takeMoney = (await host.playerDecision('Беру    Беру', 'ПРИЗ   ДЕНЬГИ', 'Приз!', 'Деньги.')) > 0;
    if (takeMoney) {
      await host.yakubovichTalk('Забирайте свои деньги!');
      do {
        await host.m.audio.sound(host.random(50), 10);
        s.drawSprite(SPRITE.RUB, host.random(295) * SCREEN_W + host.random(400), 2);
        j -= 100;
      } while (j > 0);
      break;
    }
    // DOS: deviation #7 — Yakubovich always bargains up to МИЛЛИОН (i = 0).
    if (i === 0) {
      host.playSfx('vseVashe');
      await host.yakubovichTalk('Забирайте свой приз!');
      s.print('Вы выбрали ПРИЗ и мы Вас поздравляем!', 208 * SCREEN_W + 92, 0, 14, 8);
      s.print('Фирма ИНТЕРМОДА и ПОЛЕ ЧУДЕС дарит Вам', 226 * SCREEN_W + 88, 0, 14, 8);
      const prize = `${PRIZES[host.random(10)]} компании PROCTER & GAMBLE!`;
      s.print(prize, 244 * SCREEN_W + 240 - host.len(prize) * FONT_HALF_PX, 0, 14, 8);
      s.print('За ПРИЗОМ обращайтесь по адресу:', 262 * SCREEN_W + 112, 0, 14, 8);
      s.print('101000-Ц, Москва, проезд Серова, 11', 280 * SCREEN_W + 100, 0, 14, 8);
      s.print('На конверте сделайте пометку КОМПЬЮТЕРНЫЙ ПРИЗ', 298 * SCREEN_W + 56, 0, 14, 8);
      s.print('Автор Дима Башуров из Российского Федерального Ядерного Центра', 0x14c * SCREEN_W + 72, 0, 8, 8);
      s.print('Телефон в Арзамасе-16 : (831-30) 5-92-73   E-mail: 0669 @ RFNC. NNOV. SU', 0x155 * SCREEN_W + 32, 0, 8, 8);
      break;
    }
    j *= 10;
    i -= 1;
  }
  await host.waitKey(INFINITE);
  s.screenCopy(SCREEN_W, 350, 0, BACKBUF);
  removePlayer(host);
}

/**
 * Walk the assistant from the right, open every still-closed letter right→left,
 * then exit back to the right (same cadence as openLetter, no scoring/sting).
 */
export async function assistantRevealRemainingLetters(host: PlayerTurnHost, opts?: { leadInMs?: number }): Promise<void> {
  const s = host.screen;
  const openBeforeWalk = collectOpenedBeforeWalk(host.opened);
  const { assistPos, hits } = collectClosedCellStops({
    guessedWord: host.guessedWord,
    opened: host.opened,
    wordPos: host.wordPos,
  });
  host.remaindLetters = 0;
  host.syncDebug();
  if (hits === 0) {
    host.syncBoard(true);
    host.paintWordBoard();
    return;
  }

  host.snapshotRoundToBackbuf();
  const leadInMs = opts?.leadInMs ?? 600;
  if (leadInMs > 0) {
    await host.delay(leadInMs);
  }

  const revealed = new Set<number>();
  await host.assistantOpenWalk(assistPos, hits, (stopK) => {
    const stopOfs = assistPos[stopK];
    const cellIdx = host.letterIndexAtAssist(stopOfs);
    const letterChar = decodeCp866(host.guessedWord.subarray(cellIdx, cellIdx + 1));
    if (host.ctx.board) {
      revealed.add(cellIdx);
      host.syncBoard(true, revealed, openBeforeWalk);
    } else {
      paintCanvasOpenedLetter(s, stopOfs, letterChar);
    }
  }, { dwellMs: REVEAL_REMAINING_DWELL_MS });

  host.syncBoard(true);
  host.paintWordBoard();
}

/**
 * One player's turn (dpr:1120-1500). Returns:
 * 'again' — same player continues; 'next' — pass the turn;
 * 'won' — round solved by the current player.
 */
export async function takeTurn(host: PlayerTurnHost): Promise<TurnOutcome> {
  host.setScene('turn');
  const seat = host.seats[host.curPlayer];
  const human = host.isHuman(host.curPlayer);

  // WEB: letter already chosen — finish opening without re-spin / re-pick.
  if (host.resumeAtLetterOpen) {
    const { awardKind, awardUnit, letterIdx, plusPosition } = host.resumeAtLetterOpen;
    host.resumeAtLetterOpen = null;
    const found = await openLetter(host, letterIdx, plusPosition, letterAwardFromResume(awardKind, awardUnit));
    if (found) {
      if (human) { host.movesForBox += 1; }
      return 'again';
    }
    return 'next';
  }

  // WEB: resume straight to letter-pick if spin was already done before reload.
  if (host.resumeAtLetterPick) {
    const { awardKind, awardUnit } = host.resumeAtLetterPick;
    host.resumeAtLetterPick = null;
    const award = letterAwardFromResume(awardKind, awardUnit);
    const letterIdx = await pickLetter(host);
    host.persistCheckpoint('letter-open', award, { letterIdx });
    const found = await openLetter(host, letterIdx, 0, award);
    if (found) {
      if (human) { host.movesForBox += 1; }
      return 'again';
    }
    return 'next';
  }

  const skipSpin = host.resumeAfterSpin;
  host.resumeAfterSpin = false;

  if (!skipSpin) {
    // DOS: box game after 3 successful MOVES, human seats only (deviations #4, #5).
    // WEB: all seats trigger the box game, not just human (DIFF #30).
    if (host.movesForBox > 2) {
      await boxGame(host);
    }

    await host.yakubovichTalk(host.playerName(host.curPlayer), 'Вращайте барабан!');
    if (human) {
      const choice = await host.playerDecision(
        'Скажу   Кручу',
        'СЛОВО  БАРАБАН',
        'Скажу слово!',
        'Кручу барабан!',
        undefined,
        { deferSpeech: true },
      );
      if (choice === 0) {
        await host.playerSay('Скажу слово!');
        const result = await tellWord(host);
        if (result === 'won') {
          host.winner = host.curPlayer;
          host.persistCheckpoint('word-solved');
          return 'won';
        }
        return 'next';
      }
      await Promise.all([host.playerSay('Кручу барабан!'), host.spinWheel()]);
    } else {
      await host.yakubovichSetSilent();
      await host.spinWheel();
    }
    // Anti-cheat: drum result is committed before sector dialogue / letter pick.
    host.persistCheckpoint('after-spin');
  }

  const landed = WHEEL_SECTORS[host.curSector];
  let award: LetterAward = { kind: 'keep' };

  switch (landed.kind) {
    case 'bankrupt': {
      host.playSfx('bankrupt');
      await host.yakubovichTalk('Все деньги сгорели! Увы! Переход хода.');
      const burned = seat.score;
      seat.score = 0;
      await host.updateMoney(host.curPlayer, burned);
      return 'next';
    }
    case 'zero': {
      host.playSfx('sectorZero');
      await host.yakubovichTalk('У вас 0 очков! Увы! Переход хода.');
      return 'next';
    }
    case 'plus': {
      host.playSfx('sectorPlus');
      await host.yakubovichTalk('Сектор плюс! Откройте любую букву!');
      const n = await pickPlusPosition(host);
      const letterIdx = host.guessedWord[n - 1] - CP866_A;
      host.persistCheckpoint('letter-open', { kind: 'keep' }, { letterIdx, plusPosition: n });
      const found = await openLetter(host, letterIdx, n, { kind: 'keep' });
      if (found) {
        if (human) {
          host.movesForBox += 1;
        }
        return 'again';
      }
      return 'next';
    }
    case 'x2': {
      host.playSfx('sectorX2');
      await host.yakubovichTalk('У вас призовой сектор — все ваши очки умножаются на 2, буква!');
      award = { kind: 'double' };
      break;
    }
    case 'prize': {
      host.playSfx('sectorPrize');
      await host.yakubovichTalk('Сектор приз! Приз или играем?');
      const play = (await host.playerDecision('Беру   Буду', 'ПРИЗ  ИГРАТЬ', 'Приз!', 'Играем!', human ? undefined : 1)) > 0;
      if (play) {
        await host.yakubovichReply('Если так, то назовите букву.');
        break;
      }
      await prizeCeremony(host);
      return 'next';
    }
    case 'points': {
      award = { kind: 'perHit', unit: landed.value };
      await host.yakubovichTalk(`У вас ${landed.value} очков! Назовите букву!`);
      break;
    }
  }

  host.persistCheckpoint('letter-pick', award);
  const letterIdx = await pickLetter(host);
  host.persistCheckpoint('letter-open', award, { letterIdx });
  const found = await openLetter(host, letterIdx, 0, award);
  if (found) {
    if (human) {
      host.movesForBox += 1;
    }
    return 'again';
  }
  return 'next';
}

/**
 * dpr:1501-1514. Returns false when every seat is removed (→ adware path).
 */
export async function nextPlayer(host: PlayerTurnHost): Promise<boolean> {
  // await host.waitKey(2000);
  await host.yakubovichSetSilent();
  host.movesForBox = 0;
  const start = host.curPlayer;
  for (;;) {
    host.curPlayer = (host.curPlayer + 1) % 3;
    if (host.seats[host.curPlayer].spriteId !== null) {
      return true;
    }
    if (host.curPlayer === start) {
      return false;
    }
  }
}
