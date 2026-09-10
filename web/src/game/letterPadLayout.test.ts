import { describe, expect, it } from 'vitest';

import { ALPHABET_LEN } from './constants';
import {
  LETTER_PAD_COLS,
  LETTER_PAD_LETTERS,
  LETTER_PAD_ROWS,
  LETTER_PAD_USED,
  isLetterPadAvailable,
  letterPadCell,
  letterPadIndex,
  letterPadIndexFromChar,
} from './letterPadLayout';

describe('letterPadLayout', () => {
  it('uses 4×8 = 32 (not 4×7 = 28) for А–Я', () => {
    expect(LETTER_PAD_ROWS).toBe(4);
    expect(LETTER_PAD_COLS).toBe(8);
    expect(LETTER_PAD_ROWS * LETTER_PAD_COLS).toBe(ALPHABET_LEN);
    expect(LETTER_PAD_LETTERS).toHaveLength(32);
    expect(LETTER_PAD_LETTERS[0]).toBe('А');
    expect(LETTER_PAD_LETTERS[31]).toBe('Я');
  });

  it('maps row/col ↔ index', () => {
    expect(letterPadIndex(0, 0)).toBe(0);
    expect(letterPadIndex(0, 7)).toBe(7);
    expect(letterPadIndex(1, 0)).toBe(8);
    expect(letterPadIndex(3, 7)).toBe(31);
    expect(letterPadCell(31)).toEqual({ row: 3, col: 7 });
  });

  it('treats 0x20 as used / empty slot', () => {
    const available = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      available[i] = 0x80 + i;
    }
    available[5] = LETTER_PAD_USED;
    expect(isLetterPadAvailable(available, 5)).toBe(false);
    expect(isLetterPadAvailable(available, 4)).toBe(true);
  });

  it('maps typed Cyrillic to index', () => {
    expect(letterPadIndexFromChar('А')).toBe(0);
    expect(letterPadIndexFromChar('а')).toBe(0);
    expect(letterPadIndexFromChar('Я')).toBe(31);
    expect(letterPadIndexFromChar('я')).toBe(31);
    expect(letterPadIndexFromChar('Q')).toBe(-1);
  });
});
