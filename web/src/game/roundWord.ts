/**
 * Round / super-game word selection helpers (dpr:1091-1115 + DIFF #26 scoring).
 * Keeps chooseRoundWord / selectSupergameWord indexing and board offset math
 * in one place without pulling the full Game class.
 */
import type { OvlQuestion } from '../assets/ovl';
import { encodeCp866 } from '../encoding/cp866';
import { SCREEN_W } from '../engine/types';
import { ALPHABET_LEN, TOURNAMENT_ROUNDS } from './constants';
import type { LetterAward } from './letterAward';
import { WORD_CELL_WIDTH } from './boardLetters';

/** Blank / used alphabet slot (space). */
const ALPHA_USED = 0x20;
/** CP866 А = 0x80; letter index = byte - CP866_A. */
const CP866_A = 0x80;

/** Board left-edge row (dpr layout) and centering bias for a 12-cell half-board. */
const WORD_BOARD_ROW = 0x19;
const WORD_BOARD_CENTER_X = 121;
const WORD_BOARD_HALF_CELLS = 12;

/** Board left-edge offset for a centered word of `remaindLetters` cells. */
export function wordBoardOffset(remaindLetters: number): number {
  const halfWordCells = Math.floor(remaindLetters / 2);
  return (
    WORD_BOARD_ROW * SCREEN_W +
    WORD_BOARD_CENTER_X +
    WORD_BOARD_HALF_CELLS * WORD_CELL_WIDTH -
    halfWordCells * WORD_CELL_WIDTH
  );
}

/**
 * 1-based question index. When the pool is large enough (≥ tournament rounds),
 * retry until unused in `used` (Delphi deviation #12). Smaller pools allow repeats.
 */
export function pickQuestionIndex(
  poolSize: number,
  used: readonly number[],
  random: (n: number) => number,
  opts?: { readonly minPoolForUnique?: number },
): number {
  if (poolSize <= 0) {
    throw new Error('No questions loaded');
  }
  const minPool = opts?.minPoolForUnique ?? TOURNAMENT_ROUNDS;
  if (poolSize >= minPool) {
    let curWord: number;
    do {
      curWord = random(poolSize) + 1;
    } while (used.includes(curWord));
    return curWord;
  }
  // WEB: pools smaller than 8 would soft-lock the retry loop; allow repeats.
  return random(poolSize) + 1;
}

export interface PreparedRoundWord {
  readonly guessedWord: Uint8Array;
  readonly remaindLetters: number;
  readonly opened: boolean[];
  readonly theme: string;
  readonly wordPos: number;
  readonly question: OvlQuestion;
}

/** Encode the OVL question and compute board geometry (evidence-corrected pairing). */
export function prepareRoundWord(question: OvlQuestion): PreparedRoundWord {
  const guessedWord = encodeCp866(question.word);
  const remaindLetters = guessedWord.length;
  return {
    guessedWord,
    remaindLetters,
    opened: new Array(remaindLetters).fill(false),
    theme: question.theme,
    wordPos: wordBoardOffset(remaindLetters),
    question,
  };
}

/** TV scoring after a successful letter open (DIFF #26). */
export function applyLetterScore(score: number, award: LetterAward, hits: number): number {
  if (award.kind === 'perHit') {
    return score + award.unit * hits;
  }
  if (award.kind === 'double') {
    return score * 2;
  }
  // Плюс / keep: score unchanged.
  return score;
}

function letterIndexFromByte(byte: number): number {
  return byte - CP866_A;
}

function isUsedAlphabet(available: Uint8Array, idx: number): boolean {
  return available[idx] === ALPHA_USED;
}

/**
 * NPC alphabet pick (dpr:1389-1396). Prefer a letter still in the word when
 * fewer than half the cells remain and stage luck says so.
 */
export function npcPickLetterIndex(
  available: Uint8Array,
  guessedWord: Uint8Array,
  remaindLetters: number,
  stage: number,
  random: (n: number) => number,
): number {
  const preferWordLetter =
    remaindLetters * 2 < guessedWord.length && random(stage + 2) > 0;

  let i: number;
  if (preferWordLetter) {
    do {
      i = letterIndexFromByte(guessedWord[random(guessedWord.length)]!);
    } while (isUsedAlphabet(available, i));
  } else {
    do {
      i = random(ALPHABET_LEN);
    } while (isUsedAlphabet(available, i));
  }
  return i;
}

export type LetterPickDir = 1 | -1;

/** Skip used alphabet cells while the hand travels (human letter-pick). */
export function nearestAvailableLetter(
  available: Uint8Array,
  idx: number,
  dir: LetterPickDir,
): number | null {
  let next = idx + dir;
  while (next >= 0 && next < ALPHABET_LEN && isUsedAlphabet(available, next)) {
    next += dir;
  }
  if (next >= 0 && next < ALPHABET_LEN) {
    return next;
  }
  next = idx - dir;
  while (next >= 0 && next < ALPHABET_LEN && isUsedAlphabet(available, next)) {
    next -= dir;
  }
  if (next >= 0 && next < ALPHABET_LEN) {
    return next;
  }
  return null;
}

export function firstAvailableLetter(available: Uint8Array): number {
  for (let startIdx = 0; startIdx < ALPHABET_LEN; startIdx += 1) {
    if (!isUsedAlphabet(available, startIdx)) {
      return startIdx;
    }
  }
  return ALPHABET_LEN;
}
