/**
 * Letter-pad grid geometry (presentation).
 *
 * User ask mentioned "4×7", but 4×7 = 28 cannot hold all 32 А–Я letters.
 * Layout is **4 rows × 8 cols = 32**.
 */
import { ALPHABET_LEN } from './constants';

/** Blank / used alphabet slot (space) — same sentinel as roundWord / DOS. */
export const LETTER_PAD_USED = 0x20;

export const LETTER_PAD_ROWS = 4;
export const LETTER_PAD_COLS = 8;

/** CP866 А..Я in display order (index 0..31). */
export const LETTER_PAD_LETTERS = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';

if (LETTER_PAD_LETTERS.length !== ALPHABET_LEN) {
  throw new Error(`LETTER_PAD_LETTERS must be ${ALPHABET_LEN} chars`);
}
if (LETTER_PAD_ROWS * LETTER_PAD_COLS !== ALPHABET_LEN) {
  throw new Error('letter pad must be 4×8 = 32');
}

export function letterPadIndex(row: number, col: number): number {
  return row * LETTER_PAD_COLS + col;
}

export function letterPadCell(index: number): { readonly row: number; readonly col: number } {
  return {
    row: Math.floor(index / LETTER_PAD_COLS),
    col: index % LETTER_PAD_COLS,
  };
}

export function isLetterPadAvailable(available: Uint8Array, index: number): boolean {
  return index >= 0 && index < ALPHABET_LEN && available[index] !== LETTER_PAD_USED;
}

/** Map a typed character (А–Я / а–я) to alphabet index, or -1. */
export function letterPadIndexFromChar(ch: string): number {
  if (!ch) {
    return -1;
  }
  const upper = ch.length === 1 ? ch.toUpperCase() : ch.charAt(0).toUpperCase();
  return LETTER_PAD_LETTERS.indexOf(upper);
}
