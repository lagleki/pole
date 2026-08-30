import { describe, expect, it } from 'vitest';

import { defaultRenderSpec } from '../spec';
import { ASSIST_TRANSPARENT, assistXY, indexedSpriteToSvg } from './svgAssist';

describe('svg assist', () => {
  it('maps linear ofs to screen coordinates', () => {
    expect(assistXY(640 * 25 + 40)).toEqual({ x: 40, y: 25 });
  });

  it('omits the transparent index and merges runs', () => {
    const palette = defaultRenderSpec.palette;
    const pixels = new Uint8Array([
      ASSIST_TRANSPARENT, 15, 15,
      7, ASSIST_TRANSPARENT, 7,
    ]);
    const svg = indexedSpriteToSvg(pixels, 3, 2, ASSIST_TRANSPARENT, palette);
    expect(svg).toContain('width="2"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg.match(/<rect/g)?.length).toBe(3);
    expect(svg).not.toContain('#00aa00');
  });
});
