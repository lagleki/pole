import { describe, expect, it } from 'vitest';

import {
  ADWARE_COPY_W,
  ADWARE_DST_X,
  ADWARE_DST_Y0,
  ADWARE_I0,
  ADWARE_LINES,
  ADWARE_MAX_H,
  ADWARE_SPRITE_DX,
  ADWARE_SPRITE_DY,
  adwareLineXY,
  adwareRiseH,
  adwareRiseY,
  buildAdwareSvg,
} from './svgAdware';

describe('svg adware plaque', () => {
  it('keeps the DOS rising-copy geometry', () => {
    expect(ADWARE_COPY_W).toBe(168);
    expect(ADWARE_MAX_H).toBe(160);
    expect(ADWARE_DST_X).toBe(0x33d58 % 640);
    expect(ADWARE_DST_Y0).toBe(Math.floor(0x33d58 / 640));
    expect(adwareRiseY(ADWARE_I0)).toBe(ADWARE_DST_Y0);
    expect(adwareRiseH(ADWARE_I0)).toBe(2);
    expect(adwareRiseY(0)).toBe(173);
    expect(adwareRiseH(0)).toBe(160);
    expect(ADWARE_DST_X).toBe(472);
    expect(adwareRiseY(ADWARE_I0) + adwareRiseH(ADWARE_I0)).toBe(adwareRiseY(0) + adwareRiseH(0));
    expect(ADWARE_SPRITE_DX).toBe(9);
    expect(ADWARE_SPRITE_DY).toBe(0);
  });

  it('places the DOS copy lines on the plaque and emits an overlay clip', () => {
    const first = adwareLineXY(0x1b4e9);
    expect(first).toEqual({ x: 17, y: 1 });
    const svg = buildAdwareSvg();
    expect(svg).toContain('id="adware-root"');
    expect(svg).toContain('id="adware-clip"');
    expect(svg).toContain('ПОЛЕ ЧУДЕС!');
    expect(svg).toContain('Компьютерная игра');
    expect(svg).toContain('#ffff55');
    expect(ADWARE_LINES).toHaveLength(10);
  });
});
