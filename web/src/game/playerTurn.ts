/**
 * Player turn orchestration: box game, spin-sector handling, letter pick/open,
 * word solve, prize ceremony, seat pass (dpr:1120-1514 + DIFF #26/#30).
 */
import { decodeCp866 } from '../encoding/cp866';
import { INFINITE, SCREEN_W, type Machine, type ScreenApi } from '../engine/types';
import type { SfxId, SfxPlayOptions } from '../engine/sfx';
import { liveSeat, MONEY_VALUES, PRIZES } from './constants';
import { PRIZE_LAYOUT } from './svgCeremony';
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
  WORD_CELL_WIDTH,
  applyAssistStopsOpened,
  collectClosedCellStops,
  collectLetterHitStops,
  type AssistStop,
  type AssistantWalkOptions,
} from './assistantWalk';
import { openedIndexSet } from './boardLetters';
import {
  applyLetterScore,
  npcPickLetterIndex,
} from './roundWord';
import { boxBringIn, boxClosedPair, boxReveal } from './svgBoxes';
import { animateFrames } from './tween';
import { WHEEL_SECTORS } from './tvWheel';
import type { BoardWordCell } from './svgBoard';

const ALPHA_USED = 0x20;
const CP866_A = 0x80;
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
  resumeAtBoxChosen: { choice: number; winning: number } | null;
  resumeAtLetterOpen: {
    awardKind: AwardKind;
    awardUnit: number;
    letterIdx: number;
    plusPosition: number;
  } | null;
  setScene(scene: Scene): void;
  persistCheckpoint(
    checkpoint: GameProgressSave['checkpoint'],
    award?: LetterAward,
    pick?: { letterIdx?: number; plusPosition?: number; boxChoice?: number; boxWinning?: number },
  ): void;
  isHuman(seatIdx: number): boolean;
  playerName(seatIdx: number): string;
  useSvgPlayers(): boolean;
  paintSeatSprite(seatIdx: number, spriteId?: number | null): void;
  paintAlphabetRow(): void;
  paintWordBoard(): void;
  drawFortuneWheel(a: number): void;
  hideWheel(): void;
  syncBoard(visible?: boolean, revealedDuringWalk?: ReadonlySet<number>, openBeforeWalk?: ReadonlySet<number>): void;
  syncDebug(): void;
  wordBoardCells(entryBytes?: Uint8Array, revealedDuringWalk?: ReadonlySet<number>, openBeforeWalk?: ReadonlySet<number>): BoardWordCell[];
  snapshotRoundToBackbuf(): void;
  inSupergameSolve(): boolean;
  spinWheel(): Promise<void>;
  assistantOpenWalk(
    stops: readonly AssistStop[],
    openAtStop: (stop: AssistStop) => void,
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


function collectOpenedBeforeWalk(opened: readonly boolean[]): ReadonlySet<number> {
  return openedIndexSet(opened);
}

/** Blank a used alphabet tile cell (SVG alphabet required). */
export function clearAlphabetCell(host: PlayerTurnHost, letterIdx: number): void {
  const alphabet = host.ctx.alphabet;
  if (!alphabet) {
    throw new Error('alphabet view required (SVG scene graph)');
  }
  alphabet.setVanishFrame(letterIdx, 3);
}

/** dpr:1410-1424 — lift the used letter off the alphabet row (WEB: SVG vanish frames). */
export async function vanishAlphabetTile(host: PlayerTurnHost, letterIdx: number): Promise<void> {
  const alphabet = host.ctx.alphabet;
  if (!alphabet) {
    throw new Error('alphabet view required (SVG scene graph)');
  }
  for (let i = 0; i <= 3; i += 1) {
    alphabet.setVanishFrame(letterIdx, i);
    let k = 0;
    for (let j = 1; j <= 10; j += 1) {
      k = host.m.audio.pwm(host.audioBuf, k, i * 100 + j * 10 + 50, 1);
      k = host.m.audio.pwm(host.audioBuf, k, 0, Math.floor(j / 5) + i * 4);
    }
    await host.m.audio.playWav(host.audioBuf.subarray(0, k));
  }
}

/** dpr:1125-1189. DOS: offered to human seats only (deviation #5).
 * WEB: BoxesView scene poses + animateFrames — canvas blit choreography deleted.
 */
export async function boxGame(host: PlayerTurnHost): Promise<void> {
  host.setScene('box-game');
  const { talkBubbleOfs } = liveSeat(host.curPlayer);
  const boxes = host.ctx.boxes;
  if (!boxes) {
    throw new Error('boxes view required (SVG scene graph)');
  }

  await host.yakubovichTalk('Три правильно угаданные буквы дают вам право на две шкатулки. Две шкатулки в студию!');

  // Bring-in: frame 0..30 with DOS delay schedule delay(30-frame) + rising pitch.
  await animateFrames({
    frameCount: 31,
    delayMs: (frame) => 30 - frame,
    onFrame: async (frame) => {
      const i = 30 - frame;
      await host.m.audio.sound(1000 - i * 20, 10, { audible: true });
      boxes.show(boxBringIn(talkBubbleOfs, frame));
    },
    delay: (ms) => host.delay(ms),
  });
  await host.waitKey(5000);

  await host.m.audio.sound(1000, 10, { audible: true });
  boxes.show(boxClosedPair(talkBubbleOfs, false).slice(0, 1));
  await host.m.audio.sound(100, 10, { audible: true });
  boxes.show(boxClosedPair(talkBubbleOfs, false));
  await host.m.audio.sound(500, 10, { audible: true });
  await host.waitKey(2000);

  let k = host.random(20) + 10;
  for (let i = k; i >= 0; i -= 1) {
    await host.m.audio.sound(host.random(100) + 50, 10, { audible: true });
    await host.delay(50);
    boxes.show(boxClosedPair(talkBubbleOfs, (i & 1) !== 0));
  }
  await host.yakubovichSetSilent();
  await host.yakubovichTalk('Какую вам шкатулку? Левую-правую, правую-левую?');
  const humanSeat = host.isHuman(host.curPlayer);
  const choice = await host.playerDecision(
    '',
    '',
    'Левая',
    'Правая',
    humanSeat ? undefined : host.random(2),
  );
  await host.yakubovichSetSilent();
  k &= 1;
  // Anti-cheat: commit choice + shuffled winner before reveal.
  host.persistCheckpoint('box-chosen', undefined, { boxChoice: choice, boxWinning: k });
  await resolveBoxReveal(host, choice, k);
}

/** Reveal + payout after left/right is committed (also used on resume). */
export async function resolveBoxReveal(
  host: PlayerTurnHost,
  choice: number,
  winning: number,
): Promise<void> {
  const seat = host.seats[host.curPlayer];
  const { talkBubbleOfs } = liveSeat(host.curPlayer);
  const boxes = host.ctx.boxes;
  if (!boxes) {
    throw new Error('boxes view required (SVG scene graph)');
  }
  boxes.show(boxReveal(talkBubbleOfs, winning === 1));
  if (choice === winning) {
    host.playSfx('boxMoney');
    await host.yakubovichReply('Браво!!! Вы отгадали!');
    const before = seat.score;
    // DIFF #29: TV-scale purse; DOS awarded 100.
    seat.score += 1000;
    await host.yakubovichSetSilent();
    boxes.setVisible(false);
    await host.updateMoney(host.curPlayer, before);
  } else {
    host.playSfx('boxEmpty');
    await host.yakubovichReply('Увы! Эта шкатулка пуста!');
    await host.yakubovichSetSilent();
    boxes.setVisible(false);
    await host.updateMoney(host.curPlayer, seat.score);
  }
  host.movesForBox = 0;
  // Clear box checkpoint so a later reload does not re-payout.
  host.persistCheckpoint('in-round');
}

/** dpr:1196-1224. Returns 'won' | 'removed'. */
export async function tellWord(host: PlayerTurnHost): Promise<'won' | 'removed'> {
  host.setScene('word-solve');
  const { input } = host.m;

  const maxLen = host.guessedWord.length;
  const entry = input.beginTextEntry(maxLen, host.wordPos + 13 * SCREEN_W + 4, 16);
  const board = host.ctx.board;
  if (!board) {
    throw new Error('board view required (SVG scene graph)');
  }
  const pollEntry = globalThis.setInterval(() => {
    board.setWordBoard(host.wordPos, host.wordBoardCells(new Uint8Array(entry.bytes)));
  }, 50);
  board.setWordBoard(host.wordPos, host.wordBoardCells(new Uint8Array(entry.bytes)));
  await input.waitEnter(INFINITE);
  globalThis.clearInterval(pollEntry);
  input.endTextEntry();
  board.setWordBoard(host.wordPos, host.wordBoardCells());

  const typed = new Uint8Array(entry.bytes);
  const match = typed.length === host.guessedWord.length
    && typed.every((b, idx) => b === host.guessedWord[idx]);
  if (match) {
    await concludeCorrectWordGuess(host);
    return 'won';
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
  host.seats[host.curPlayer].spriteId = null;
  host.seats[host.curPlayer].nameBytes = new Uint8Array(0);
  // WEB: HUD / players scene graph clear the seat; no canvas fillRect wipe.
  if (host.useSvgPlayers()) {
    host.paintSeatSprite(host.curPlayer, null);
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
  const { input } = host.m;

  if (!host.isHuman(host.curPlayer)) {
    let n: number;
    do {
      n = host.random(host.guessedWord.length) + 1;
    } while (host.available[host.guessedWord[n - 1] - CP866_A] === ALPHA_USED);
    return n;
  }

  if (!host.ctx.hand) {
    throw new Error('hand view required (SVG scene graph)');
  }
  const hand = input.hand;
  hand.step = 16;
  hand.ofs = host.wordPos - 13 * SCREEN_W;
  hand.min = hand.ofs;
  hand.max = hand.ofs + host.guessedWord.length * WORD_CELL_WIDTH - WORD_CELL_WIDTH;
  hand.prev = 12 * SCREEN_W + 0xc8;
  let n = 1;
  for (;;) {
    // WEB: HandView is synced from main.ts; no canvas saveBehind choreography.
    n = Math.floor((hand.ofs - hand.min + WORD_CELL_WIDTH) / WORD_CELL_WIDTH);
    const letterIdx = host.guessedWord[n - 1]! - CP866_A;
    if (input.pollKeyPressed()) {
      if (host.available[letterIdx] === ALPHA_USED) {
        await host.m.audio.sound(1000, 32);
      } else {
        break;
      }
    }
    await host.delay(10);
  }
  hand.step = 0;
  return n;
}

/**
 * dpr:1366-1396 — pick a letter. Returns letter index 0..31.
 * Human: full-screen letter pad (no hand cursor). NPC: programmatic pick, pad stays hidden.
 */
export async function pickLetter(host: PlayerTurnHost): Promise<number> {
  host.setScene('letter-pick');

  if (!host.isHuman(host.curPlayer)) {
    // dpr:1389-1396 — NPC heuristic; do not show the pad.
    const i = npcPickLetterIndex(
      host.available,
      host.guessedWord,
      host.remaindLetters,
      host.stage,
      (n) => host.random(n),
    );
    clearAlphabetCell(host, i);
    return i;
  }

  const pad = host.ctx.letterPad;
  if (!pad) {
    throw new Error('letterPad view required (SVG scene graph)');
  }

  // Hide competing alphabet-row UX while the pad covers most of the screen.
  host.ctx.alphabet?.setVisible(false); // strip retired — pad is the only letter UI
  host.ctx.hand?.setVisible(false);

  try {
    const i = await pad.show(host.available);
    clearAlphabetCell(host, i);
    return i;
  } finally {
    pad.hide();
    host.ctx.alphabet?.setVisible(false);
  }
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
  const seat = host.seats[host.curPlayer];
  const letterByte = host.available[letterIdx];
  const letterChar = decodeCp866(new Uint8Array([letterByte]));
  host.available[letterIdx] = ALPHA_USED;
  host.syncDebug();

  // Strip retired: keep DOS vanish SFX timing without showing the alphabet row.
  await vanishAlphabetTile(host, letterIdx);
  host.paintAlphabetRow();
  const replica = letterReplica(letterChar, n);
  await host.playerSay(replica.display, replica.spoken);
  await host.yakubovichSetSilent();

  // Count matches and assistant stop positions (dpr:1427-1437).
  const openBeforeWalk = collectOpenedBeforeWalk(host.opened);
  // DIFF #23: ASSIST_STAY is 25px, cells 16px. Walk to the stand pose whose
  // midline matches the cell center (not the cell's left edge).
  // Stops are left→right; the walker opens the rightmost first (enter from right).
  const stops = collectLetterHitStops({
    guessedWord: host.guessedWord,
    letterByte,
    wordPos: host.wordPos,
  });
  applyAssistStopsOpened(host.opened, stops);
  const hits = stops.length;
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
  await host.assistantOpenWalk(stops, (stop) => {
    revealed.add(stop.cellIndex);
    host.syncBoard(true, revealed, openBeforeWalk);
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

/** dpr:1300-1359 — the ПРИЗ sector ceremony (human only under DOS policy).
 * WEB: CeremonyView + yak/players SVG — canvas blit path deleted.
 */
export async function prizeCeremony(host: PlayerTurnHost): Promise<void> {
  host.setScene('prize');
  host.hideWheel();
  host.playSfx('prizesStudio');
  host.playSfx('autoWin');
  host.playSfx('automobileYell');

  const ceremony = host.ctx.ceremony;
  if (!ceremony) {
    throw new Error('ceremony view required (SVG scene graph)');
  }
  ceremony.showStage([]);
  host.ctx.yak?.showIdle();
  if (host.ctx.players) {
    host.ctx.players.sync(
      host.seats.map((s, idx) => ({
        spriteId: idx === host.curPlayer ? s.spriteId : null,
        ofs: liveSeat(idx).spriteOfs,
      })),
    );
  }
  // Choice clouds only — hide seat plaques over the gray stage.
  if (host.ctx.hud) {
    host.ctx.hud.setSeats(
      [0, 1, 2].map(() => ({ caption: '', name: '', present: false, score: null })),
    );
    host.ctx.hud.setVisible(true);
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
        ceremony.addRub(
          host.random(PRIZE_LAYOUT.rubScatter.maxX),
          host.random(PRIZE_LAYOUT.rubScatter.maxY),
        );
        j -= 100;
      } while (j > 0);
      break;
    }
    // DOS: deviation #7 — Yakubovich always bargains up to МИЛЛИОН (i = 0).
    if (i === 0) {
      host.playSfx('vseVashe');
      await host.yakubovichTalk('Забирайте свой приз!');
      const prize = `${PRIZES[host.random(10)]} компании PROCTER & GAMBLE!`;
      const P = PRIZE_LAYOUT;
      ceremony.showStage([
        { text: 'Вы выбрали ПРИЗ и мы Вас поздравляем!', ...P.congrats },
        { text: 'Фирма ИНТЕРМОДА и ПОЛЕ ЧУДЕС дарит Вам', ...P.giftIntro },
        { text: prize, ...P.giftPrize },
        { text: 'За ПРИЗОМ обращайтесь по адресу:', ...P.addressHeader },
        { text: '101000-Ц, Москва, проезд Серова, 11', ...P.addressLine },
        { text: 'На конверте сделайте пометку КОМПЬЮТЕРНЫЙ ПРИЗ', ...P.addressNote },
        { text: 'Автор Дима Башуров из Российского Федерального Ядерного Центра', ...P.author, color: 8 },
        { text: 'Телефон в Арзамасе-16 : (831-30) 5-92-73   E-mail: 0669 @ RFNC. NNOV. SU', ...P.authorContact, color: 8 },
      ]);
      break;
    }
    j *= 10;
    i -= 1;
  }
  await host.waitKey(INFINITE);
  ceremony.setVisible(false);
  host.ctx.hud?.setVisible(false);
  host.ctx.hud?.hideBubbles();
  removePlayer(host);
}

/**
 * Walk the assistant from the right, open every still-closed letter right→left,
 * then exit back to the right (same cadence as openLetter, no scoring/sting).
 */
export async function assistantRevealRemainingLetters(host: PlayerTurnHost, opts?: { leadInMs?: number }): Promise<void> {
  const openBeforeWalk = collectOpenedBeforeWalk(host.opened);
  const stops = collectClosedCellStops({
    guessedWord: host.guessedWord,
    opened: host.opened,
    wordPos: host.wordPos,
  });
  applyAssistStopsOpened(host.opened, stops);
  host.remaindLetters = 0;
  host.syncDebug();
  if (stops.length === 0) {
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
  await host.assistantOpenWalk(stops, (stop) => {
    revealed.add(stop.cellIndex);
    host.syncBoard(true, revealed, openBeforeWalk);
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

  // WEB: шкатулка already chosen — finish reveal without re-pick / re-shuffle.
  if (host.resumeAtBoxChosen) {
    const { choice, winning } = host.resumeAtBoxChosen;
    host.resumeAtBoxChosen = null;
    host.setScene('box-game');
    await resolveBoxReveal(host, choice, winning);
    return 'again';
  }

  // WEB: letter already chosen — finish opening without re-spin / re-pick.
  if (host.resumeAtLetterOpen) {
    const { awardKind, awardUnit, letterIdx, plusPosition } = host.resumeAtLetterOpen;
    host.resumeAtLetterOpen = null;
    const found = await openLetter(host, letterIdx, plusPosition, letterAwardFromResume(awardKind, awardUnit));
    if (found) {
      host.movesForBox += 1;
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
      host.movesForBox += 1;
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
        host.movesForBox += 1;
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
    host.movesForBox += 1;
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
