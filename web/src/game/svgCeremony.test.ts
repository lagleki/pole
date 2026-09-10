import { describe, expect, it } from 'vitest';

import {
  CEREMONY_LOGO_CHUDES,
  CEREMONY_LOGO_POLE,
  ENDGAME_LAYOUT,
  TOP8_COPY_W,
  TOP8_DST_X,
  TOP8_DST_Y0,
  TOP8_I0,
  TOP8_LAYOUT,
  TOP8_MAX_H,
  buildCeremonySvgForTest,
  top8RiseH,
  top8RiseY,
  top8RowY,
} from './svgCeremony';

describe('svg ceremony / top-8', () => {
  it('keeps the rising-plaque geometry', () => {
    expect(TOP8_COPY_W).toBe(152);
    expect(TOP8_MAX_H).toBe(160);
    expect(TOP8_DST_X).toBe(480);
    expect(TOP8_DST_Y0).toBe(323);
    expect(top8RiseY(TOP8_I0)).toBe(TOP8_DST_Y0);
    expect(top8RiseH(TOP8_I0)).toBe(2);
    expect(top8RiseY(0)).toBe(165);
    expect(top8RiseH(0)).toBe(160);
    expect(top8RiseY(TOP8_I0) + top8RiseH(TOP8_I0)).toBe(top8RiseY(0) + top8RiseH(0));
  });

  it('places top-8 titles and rows from the layout table', () => {
    expect(TOP8_LAYOUT.titles[0]).toEqual({ text: '8 лучших игроков,', x: 8, y: 5 });
    expect(TOP8_LAYOUT.titles[1]).toEqual({ text: 'выигравших ФИНАЛ!', x: 8, y: 19 });
    expect(TOP8_LAYOUT.row0).toEqual({ rankX: 0, scoreX: 110, y: 44 });
    expect(top8RowY(0)).toBe(44);
    expect(top8RowY(1)).toBe(58);
  });

  it('anchors logos and endgame body from named layout', () => {
    expect(CEREMONY_LOGO_POLE).toEqual({ x: 10, y: 10 });
    expect(CEREMONY_LOGO_CHUDES).toEqual({ x: 200, y: 10 });
    expect(ENDGAME_LAYOUT.greeting).toEqual({ x: 240, y: 190, center: true });
    expect(ENDGAME_LAYOUT.body).toEqual({ x: 76, y: 226 });
    expect(ENDGAME_LAYOUT.authorContact).toEqual({ x: 32, y: 341 });
  });

  it('emits stage + clipped top-8 overlay markup', () => {
    const svg = buildCeremonySvgForTest();
    expect(svg).toContain('id="ceremony-root"');
    expect(svg).toContain('id="top8-clip"');
    expect(svg).toContain('id="ceremony-art-rub"');
    expect(svg).toContain('display="none"');
  });
});
