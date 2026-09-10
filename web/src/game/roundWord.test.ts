import { describe, expect, it } from 'vitest';
import {
  applyLetterScore,
  firstAvailableLetter,
  nearestAvailableLetter,
  npcPickLetterIndex,
  pickQuestionIndex,
  prepareRoundWord,
  wordBoardOffset,
} from './roundWord';
import { SCREEN_W } from '../engine/types';

describe('roundWord', () => {
  it('wordBoardOffset centers by cell count', () => {
    expect(wordBoardOffset(10)).toBe(0x19 * SCREEN_W + 121 + 12 * 16 - ((10 >> 1) << 4));
  });

  it('pickQuestionIndex avoids used when pool is large', () => {
    const used = [1, 2, 3];
    let calls = 0;
    const seq = [0, 1, 2, 3]; // -> words 1,2,3,4
    const idx = pickQuestionIndex(20, used, () => {
      const v = seq[calls] ?? 4;
      calls += 1;
      return v;
    });
    expect(idx).toBe(4);
    expect(calls).toBe(4);
  });

  it('pickQuestionIndex allows repeats for tiny pools', () => {
    const idx = pickQuestionIndex(3, [1, 2, 3], () => 1);
    expect(idx).toBe(2);
  });

  it('prepareRoundWord encodes and blanks', () => {
    const prepared = prepareRoundWord({ word: 'КОТ', theme: 'животное' });
    expect(prepared.remaindLetters).toBe(3);
    expect(prepared.opened).toEqual([false, false, false]);
    expect(prepared.theme).toBe('животное');
    expect(prepared.wordPos).toBe(wordBoardOffset(3));
  });

  it('applyLetterScore covers award kinds', () => {
    expect(applyLetterScore(100, { kind: 'perHit', unit: 50 }, 2)).toBe(200);
    expect(applyLetterScore(100, { kind: 'double' }, 2)).toBe(200);
    expect(applyLetterScore(100, { kind: 'keep' }, 2)).toBe(100);
  });

  it('alphabet helpers skip used tiles', () => {
    const available = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) available[i] = 0x80 + i;
    available[0] = 0x20;
    available[1] = 0x20;
    expect(firstAvailableLetter(available)).toBe(2);
    expect(nearestAvailableLetter(available, 1, 1)).toBe(2);
    // From 2 leftward: 1 and 0 used → other direction finds 3? dir -1 fails then tries +1 → 3
    expect(nearestAvailableLetter(available, 2, -1)).toBe(3);
  });

  it('nearestAvailableLetter tries the other direction', () => {
    const available = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) available[i] = 0x80 + i;
    available[5] = 0x20;
    available[6] = 0x20;
    available[7] = 0x20;
    expect(nearestAvailableLetter(available, 6, 1)).toBe(8);
    expect(nearestAvailableLetter(available, 6, -1)).toBe(4);
  });

  it('npcPickLetterIndex returns an available index', () => {
    const available = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) available[i] = 0x80 + i;
    available[0] = 0x20;
    const word = new Uint8Array([0x80, 0x81, 0x82]);
    const vals = [0, 1]; // first random(32)=0 used, then 1 free
    let n = 0;
    const i = npcPickLetterIndex(available, word, 3, 0, () => vals[n++] ?? 1);
    expect(i).toBe(1);
  });
});
