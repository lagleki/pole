import { describe, expect, it } from 'vitest';

import { handXY } from './svgHand';

describe('svg hand', () => {
  it('maps linear ofs to screen coordinates', () => {
    expect(handXY(640 * 10 + 120)).toEqual({ x: 120, y: 10 });
  });
});
