import { describe, expect, it } from 'vitest';

import { HAND_H, HAND_VIEWBOX, HAND_W, handXY } from './svgHand';

describe('svg hand', () => {
  it('maps linear ofs to screen coordinates', () => {
    expect(handXY(640 * 10 + 120)).toEqual({ x: 120, y: 10 });
  });

  it('uses Wikimedia hand pointer rotated finger-down', () => {
    expect(HAND_VIEWBOX).toBe('19 0 13 24');
    expect(HAND_W).toBe(14);
    expect(HAND_H).toBe(24);
  });
});
