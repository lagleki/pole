/**
 * Post-finals super-game orchestration (DIFF #31): prize basket, drum, letters,
 * think/solve timers. Letter pick/open stay on PlayerTurnHost via the shared Game host.
 */
import { decodeCp866 } from '../encoding/cp866';
import { BACKBUF, INFINITE, SCREEN_W, type Machine, type ScreenApi } from '../engine/types';
import type { SfxId, SfxPlayOptions } from '../engine/sfx';
import { defaultAssetSpec } from '../spec';
import { SUPERGAME_BANNER } from './constants';
import type { GameContext, GameSeat, Scene } from './gameTypes';
import type { GameProgressSave } from './persist';
import type { LetterAward } from './letterAward';
import { buildPrizeBasket, type SupergamePrize } from './supergamePrizes';
import { superWheelPrizes } from './superWheel';
import { pickQuestionIndex, prepareRoundWord } from './roundWord';
import { supergameGreeting, supergamePrizeIntro } from './hostIntro';
import type { BoardWordCell } from './svgBoard';

const SPRITE = defaultAssetSpec.spriteIds;

export interface SupergameFlowHost {
  readonly screen: ScreenApi;
  readonly m: Machine;
  readonly ctx: GameContext;
  readonly seats: GameSeat[];
  readonly available: Uint8Array;
  readonly prevWords: number[];
  winner: number;
  curPlayer: number;
  curSector: number;
  guessedWord: Uint8Array;
  remaindLetters: number;
  wordPos: number;
  opened: boolean[];
  stageBanner: string | null;
  supergameActive: boolean;
  supergamePlayer: number;
  supergameBasket: SupergamePrize[];
  superPrize: string;
  supergameWon: boolean | null;
  supergameAtRisk: boolean;
  superSector: number;
  wheelSuperMode: boolean;
  setScene(scene: Scene): void;
  persistCheckpoint(checkpoint: GameProgressSave['checkpoint'], award?: LetterAward, pick?: { letterIdx: number; plusPosition?: number }): void;
  isHuman(seatIdx: number): boolean;
  drawBoardChrome(): void;
  paintWordBoard(): void;
  syncPlayers(visible?: boolean): void;
  syncHud(visible?: boolean): void;
  syncAlphabet(visible?: boolean): void;
  syncBoard(visible?: boolean, revealedDuringWalk?: Set<number>, openBeforeWalk?: Set<number>): void;
  syncDebug(): void;
  wordBoardCells(entryBytes?: Uint8Array, revealedDuringWalk?: Set<number>, openBeforeWalk?: Set<number>): BoardWordCell[];
  spinWheel(): Promise<void>;
  pickLetter(): Promise<number>;
  openLetter(letterIdx: number, n: number, award: LetterAward): Promise<boolean>;
  assistantRevealRemainingLetters(opts?: { leadInMs?: number }): Promise<void>;
  playSfx(id: SfxId, options?: SfxPlayOptions): void;
  stopSfx(id?: SfxId): void;
  playerSay(displayText: string, spokenText?: string): Promise<void>;
  playerDecision(label1: string, label2: string, phrase0: string, phrase1: string, forced?: number, opts?: { deferSpeech?: boolean }): Promise<number>;
  playerConfirm(phrase: string, opts?: { deferSpeech?: boolean }): Promise<void>;
  yakubovichTalk(line1: string, line2?: string): Promise<void>;
  yakubovichSetSilent(): Promise<void>;
  delay(ms: number): Promise<void>;
  waitKey(timeoutMs: number): Promise<boolean>;
  random(n: number): number;
}

/** DIFF #31: post-finals supergame for the tournament winner. */
export async function runSupergame(host: SupergameFlowHost): Promise<void> {
  if (host.winner >= 3) {
    return;
  }

  host.supergameActive = true;
  host.supergamePlayer = host.winner;
  host.curPlayer = host.winner;
  host.stageBanner = SUPERGAME_BANNER;
  host.supergameBasket = buildPrizeBasket(host.seats[host.winner].score, {
    nextInt: (n) => host.random(n),
  });
  host.persistCheckpoint('supergame');

  host.setScene('supergame-setup');
  host.drawBoardChrome();
  host.syncPlayers(true);
  host.syncHud(true);
  host.playSfx('superGame');
  await host.yakubovichTalk(supergameGreeting());
  await host.yakubovichTalk(supergamePrizeIntro());

  host.setScene('supergame-prizes');
  host.ctx.supergameHud?.showPrizes(host.supergameBasket);
  if (host.isHuman(host.winner)) {
    await host.waitKey(INFINITE);
  } else {
    await host.delay(2500);
  }
  host.ctx.supergameHud?.hidePrizes();

  host.setScene('supergame-choice');
  const playSuper = host.isHuman(host.winner)
    ? (await host.playerDecision('Забираю  Супер', 'ПРИЗЫ   ИГРА', 'Забираю призы!', 'Супер-игра!')) > 0
    : true;
  if (!playSuper) {
    host.supergameWon = null;
    host.supergameAtRisk = false;
    host.supergameActive = false;
    host.stageBanner = null;
    return;
  }

  host.supergameAtRisk = true;
  host.wheelSuperMode = true;
  host.ctx.wheel?.setSuperMode(true);
  host.curSector = 0;
  host.superSector = 0;
  host.ctx.wheel?.setFrame(0);

  host.setScene('supergame-spin');
  await host.yakubovichTalk('Вращайте барабан супер-игры!');
  await host.playerConfirm('Кручу барабан!', { deferSpeech: true });
  await Promise.all([host.playerSay('Кручу барабан!'), host.spinWheel()]);
  host.superPrize = superWheelPrizes()[host.superSector] ?? '';
  await host.yakubovichTalk(`Суперприз — ${host.superPrize}!`);

  await selectSupergameWord(host);

  const allowedLetters = Math.ceil(host.guessedWord.length / 2);
  host.setScene('supergame-letters');
  await host.yakubovichTalk(`Назовите ${allowedLetters} букв!`);
  for (let i = 0; i < allowedLetters; i += 1) {
    const letterIdx = await host.pickLetter();
    await host.openLetter(letterIdx, 0, { kind: 'keep' });
  }

  const solved = await thinkAndSolveSupergame(host);
  if (solved) {
    host.supergameWon = true;
    host.playSfx('fanfare');
    await host.yakubovichTalk('Вы выиграли супер-игру!');
    await host.yakubovichTalk(`Ваш суперприз — ${host.superPrize}!`);
  } else {
    host.supergameWon = false;
    host.supergameBasket = [];
    await host.yakubovichTalk('Вы проиграли супер-игру!');
    await host.yakubovichTalk('Призы на кон сгорают!');
  }

  host.wheelSuperMode = false;
  host.ctx.wheel?.setSuperMode(false);
  host.ctx.wheel?.setVisible(false);
  host.supergameActive = false;
  host.stageBanner = null;
  host.syncBoard(true);
  await host.waitKey(1500);
  await host.yakubovichSetSilent();
}

export async function selectSupergameWord(host: SupergameFlowHost): Promise<void> {
  host.setScene('word-select');
  const s = host.screen;
  const { questions } = host.ctx;
  const curWord = pickQuestionIndex(
    questions.length,
    host.prevWords,
    (n) => host.random(n),
  );
  const prepared = prepareRoundWord(questions[curWord - 1]!);
  host.guessedWord = prepared.guessedWord;
  host.remaindLetters = prepared.remaindLetters;
  host.opened = prepared.opened;
  host.ctx.state.theme = prepared.theme;
  host.wordPos = prepared.wordPos;
  const question = prepared.question;

  let j = 332 * SCREEN_W + 31 * 20;
  for (let i = 31; i >= 0; i -= 1) {
    host.available[i] = 0x80 + i;
    if (!host.ctx.alphabet) {
      s.drawSprite(SPRITE.LETTER_BACK0, j, 8);
    }
    j -= 20;
  }
  if (host.ctx.alphabet) {
    host.syncAlphabet(true);
  }

  if (host.ctx.board) {
    host.syncBoard(true);
  } else {
    for (let i = host.remaindLetters - 1; i >= 0; i -= 1) {
      s.fillRect((i << 4) + host.wordPos + 11 * SCREEN_W, 19, 14, 8);
    }
  }

  // Same as selectWord: blanks must be on screen before the theme is spoken.
  await host.delay(500);
  await host.yakubovichSetSilent();
  await host.yakubovichTalk('И вот задание на супер-игру.');
  await host.yakubovichSetSilent();
  await host.yakubovichTalk(question.theme);
  await host.yakubovichSetSilent();
  host.syncDebug();
}

/** Countdown HUD while waiting for Enter; returns true if Enter won. */
export async function waitEnterCountdown(host: SupergameFlowHost, seconds: number): Promise<boolean> {
  for (let sec = seconds; sec > 0; sec -= 1) {
    host.ctx.supergameHud?.setTimer(sec);
    if (await host.m.input.waitEnter(1000)) {
      return true;
    }
  }
  return false;
}

/**
 * Super-game think minute (super-60s) with word entry open, then 15 s grace.
 * DIFF #31.
 */
export async function thinkAndSolveSupergame(host: SupergameFlowHost): Promise<boolean> {
  host.setScene('supergame-think');
  // Drop a latched Enter from the letter-pick / drum confirm so the 60s bed
  // is not stopped on the first countdown poll.
  await host.m.input.waitEnter(0);
  host.playSfx('super60s', { loop: true, restart: true });

  if (!host.isHuman(host.curPlayer)) {
    host.ctx.supergameHud?.showTimer(60);
    for (let sec = 60; sec > 0; sec -= 1) {
      host.ctx.supergameHud?.setTimer(sec);
      await host.delay(1000);
    }
    host.stopSfx('super60s');
    host.ctx.supergameHud?.hideTimer();
    await host.yakubovichTalk('Время вышло! Назовите слово!');
    return tellWordSupergameNpc(host);
  }

  const s = host.screen;
  const { input } = host.m;
  const maxLen = host.guessedWord.length;
  const entry = input.beginTextEntry(maxLen, host.wordPos + 13 * SCREEN_W + 4, 16);
  const k = maxLen << 4;
  const board = host.ctx.board;
  let pollEntry: number | undefined;
  if (board) {
    pollEntry = window.setInterval(() => {
      board.setWordBoard(host.wordPos, host.wordBoardCells(new Uint8Array(entry.bytes)));
    }, 50);
    board.setWordBoard(host.wordPos, host.wordBoardCells(new Uint8Array(entry.bytes)));
  } else {
    s.screenCopy(k, 31, BACKBUF + host.wordPos, host.wordPos);
    let j = entry.ofs - 2 * SCREEN_W - 4;
    for (let i = maxLen; i >= 1; i -= 1) {
      s.fillRect(j, 19, 14, 7);
      j += 16;
    }
  }

  host.ctx.supergameHud?.showTimer(60);
  let submitted = await waitEnterCountdown(host, 60);
  host.stopSfx('super60s');

  if (!submitted) {
    await host.yakubovichTalk('Время вышло! Назовите слово!');
    host.setScene('supergame-solve');
    host.ctx.supergameHud?.showTimer(15);
    submitted = await waitEnterCountdown(host, 15);
  } else {
    host.setScene('supergame-solve');
  }
  host.ctx.supergameHud?.hideTimer();

  if (pollEntry !== undefined) {
    window.clearInterval(pollEntry);
  }
  input.endTextEntry();

  const typed = new Uint8Array(entry.bytes);
  if (board) {
    board.setWordBoard(host.wordPos, host.wordBoardCells());
  } else {
    s.screenCopy(k, 31, host.wordPos, BACKBUF + host.wordPos);
  }
  host.paintWordBoard();

  const match = typed.length === host.guessedWord.length
    && typed.every((b, idx) => b === host.guessedWord[idx]);
  await concludeSupergameAnswer(host, match);
  return match;
}

/**
 * Assistant flips every still-closed board cell, then the host speaks the
 * word (DIFF #31). Win/lose lines follow in the caller.
 */
export async function concludeSupergameAnswer(host: SupergameFlowHost, won: boolean): Promise<void> {
  await host.yakubovichSetSilent();
  await host.assistantRevealRemainingLetters();
  if (won) {
    host.playSfx('wordCorrect');
  } else {
    host.playSfx('wordWrongSuper');
  }
  await host.yakubovichTalk(decodeCp866(host.guessedWord));
  await host.yakubovichSetSilent();
}

/** NPC-only super-game word attempt (DIFF #31). */
export async function tellWordSupergameNpc(host: SupergameFlowHost): Promise<boolean> {
  host.setScene('supergame-solve');
  const trySolve = host.remaindLetters <= Math.max(1, Math.ceil(host.guessedWord.length / 3));
  const won = trySolve && host.random(4) > 0;
  await concludeSupergameAnswer(host, won);
  return won;
}
