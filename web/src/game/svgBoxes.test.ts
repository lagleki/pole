import { describe, expect, it } from 'vitest';

import { SCREEN_W } from '../engine/types';
import { liveSeat } from './constants';
import {
  BOX_BRING_IN_FRAMES,
  boxBringIn,
  boxClosedPair,
  boxOfsXy,
  boxReveal,
} from './svgBoxes';

describe('svg boxes', () => {
  it('maps linear ofs to screen coordinates', () => {
    expect(boxOfsXy(10 * SCREEN_W + 20)).toEqual({ x: 20, y: 10 });
  });

  it('lands the bring-in on the opened + money DOS anchors', () => {
    const tb = liveSeat(0).talkBubbleOfs;
    const start = boxBringIn(tb, 0);
    const end = boxBringIn(tb, BOX_BRING_IN_FRAMES - 1);
    expect(start).toHaveLength(3);
    expect(end[0]).toEqual({ kind: 'opened', ...boxOfsXy(tb - 46 * SCREEN_W - 32) });
    expect(end[1]).toEqual({ kind: 'opened', ...boxOfsXy(tb - 46 * SCREEN_W + 24) });
    expect(end[2]).toEqual({ kind: 'money', ...boxOfsXy(tb - 60 * SCREEN_W + 26) });
    expect(start[0].y).toBeGreaterThan(end[0].y);
  });

  it('shuffles the closed pair and parks the prize on the chosen side', () => {
    const tb = liveSeat(1).talkBubbleOfs;
    const rest = boxClosedPair(tb, false);
    const shuffled = boxClosedPair(tb, true);
    expect(rest[0]).toEqual({ kind: 'closed', ...boxOfsXy(tb - 41 * SCREEN_W - 32) });
    expect(shuffled[0].x).not.toBe(rest[0].x);
    expect(boxReveal(tb, false)[2]).toEqual({
      kind: 'money',
      ...boxOfsXy(tb - 60 * SCREEN_W - 30),
    });
    expect(boxReveal(tb, true)[2]).toEqual({
      kind: 'money',
      ...boxOfsXy(tb - 60 * SCREEN_W - 30 + 56),
    });
  });
});
