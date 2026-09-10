/**
 * Board letter / cell geometry and pure queries over the guessed word.
 * DIFF #23: ASSIST_STAY is 25px, word cells 16px — stand pose midline
 * aligns to the cell center (not the cell's left edge).
 */
import { SCREEN_W } from '../engine/types';

/** DIFF #23: ASSIST_STAY sprite width. */
export const ASSIST_STAY_WIDTH = 25;
/** Word-board cell width in pixels. */
export const WORD_CELL_WIDTH = 16;
/** Stand pose midline aligned to cell center (not the cell's left edge). */
export const ASSIST_STAND_SHIFT = Math.floor((ASSIST_STAY_WIDTH - WORD_CELL_WIDTH) / 2);

/** Canvas ink row under an opened letter (matches openLetter paint). */
export const OPEN_LETTER_INK_DY = 11;

/** Stand-pose frame offset for word cell `cellIndex` (0-based, left→right). */
export function cellStandOfs(wordPos: number, cellIndex: number): number {
  return wordPos + cellIndex * WORD_CELL_WIDTH - ASSIST_STAND_SHIFT;
}

/**
 * Recover 0-based cell index from an assistant stand offset.
 * Inverse of {@link cellStandOfs}; keeps the DOS ink-row terms for oracle parity.
 */
export function letterIndexAtAssist(assistOfs: number, wordPos: number): number {
  const cellOfs = assistOfs + ASSIST_STAND_SHIFT + OPEN_LETTER_INK_DY * SCREEN_W;
  return (cellOfs - wordPos - OPEN_LETTER_INK_DY * SCREEN_W) >> 4;
}

/** 0-based indices where `guessedWord[i] === letterByte` (left→right). */
export function matchingLetterIndices(
  guessedWord: Uint8Array,
  letterByte: number,
): readonly number[] {
  const out: number[] = [];
  for (const [i, b] of guessedWord.entries()) {
    if (b === letterByte) {
      out.push(i);
    }
  }
  return out;
}

/** 0-based indices still closed on the board (left→right). */
export function closedCellIndices(opened: readonly boolean[]): readonly number[] {
  const out: number[] = [];
  for (const [i, isOpen] of opened.entries()) {
    if (!isOpen) {
      out.push(i);
    }
  }
  return out;
}

/** Indices already open before a walk (for SVG board sync). */
export function openedIndexSet(opened: readonly boolean[]): ReadonlySet<number> {
  const set = new Set<number>();
  for (const [i, isOpen] of opened.entries()) {
    if (isOpen) {
      set.add(i);
    }
  }
  return set;
}

/** Mutation boundary: mark the given cell indices open on the board mask. */
export function markCellsOpened(opened: boolean[], cellIndices: readonly number[]): void {
  for (const i of cellIndices) {
    opened[i] = true;
  }
}
