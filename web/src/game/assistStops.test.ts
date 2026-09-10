import { describe, expect, it } from 'vitest';
import {
  applyAssistStopsOpened,
  collectClosedCellStops,
  collectLetterHitStops,
  standOfsList,
} from './assistStops';
import { ASSIST_STAND_SHIFT, WORD_CELL_WIDTH, cellStandOfs, letterIndexAtAssist } from './boardLetters';

describe('assistStops / boardLetters', () => {
  it('cellStandOfs and letterIndexAtAssist are inverses', () => {
    const wordPos = 0x19 * 640 + 200;
    for (const i of [0, 1, 5, 11]) {
      const ofs = cellStandOfs(wordPos, i);
      expect(letterIndexAtAssist(ofs, wordPos)).toBe(i);
      expect(ofs).toBe(wordPos + i * WORD_CELL_WIDTH - ASSIST_STAND_SHIFT);
    }
  });

  it('collectLetterHitStops is left→right data, no sentinel table', () => {
    // CP866: А=0x80, Б=0x81, … — word АБА → hits on А at 0 and 2
    const guessedWord = new Uint8Array([0x80, 0x81, 0x80]);
    const wordPos = 1000;
    const stops = collectLetterHitStops({
      guessedWord,
      letterByte: 0x80,
      wordPos,
    });
    expect(stops.map((s) => s.cellIndex)).toEqual([0, 2]);
    expect(standOfsList(stops)).toEqual([
      cellStandOfs(wordPos, 0),
      cellStandOfs(wordPos, 2),
    ]);
    // rightmost opened first by walker = last element
    expect(stops.at(-1)?.cellIndex).toBe(2);
  });

  it('applyAssistStopsOpened mutates only at the boundary', () => {
    const guessedWord = new Uint8Array([0x80, 0x81, 0x80]);
    const opened = [false, false, false];
    const stops = collectLetterHitStops({
      guessedWord,
      letterByte: 0x80,
      wordPos: 0,
    });
    expect(opened).toEqual([false, false, false]);
    applyAssistStopsOpened(opened, stops);
    expect(opened).toEqual([true, false, true]);
  });

  it('collectClosedCellStops skips already-open cells', () => {
    const guessedWord = new Uint8Array([0x80, 0x81, 0x82, 0x83]);
    const opened = [true, false, true, false];
    const wordPos = 500;
    const stops = collectClosedCellStops({ guessedWord, opened, wordPos });
    expect(stops.map((s) => s.cellIndex)).toEqual([1, 3]);
    applyAssistStopsOpened(opened, stops);
    expect(opened).toEqual([true, true, true, true]);
  });
});
