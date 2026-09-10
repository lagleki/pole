import { describe, expect, it } from 'vitest';

import {
  SPLASH_TIMING,
  SPLASH_TITLE,
  SPLASH_TITLE_LETTERS,
  buildSplashSvgForTest,
  splashHStripeColumns,
  splashVLinePaths,
  splashVStripeRows,
  splashWipePolygon,
} from './svgSplash';
import { SPLASH_CREDITS, SPLASH_HELP, SPLASH_LOGOS } from './splashLayout';

describe('svg splash', () => {
  it('keeps title letter anchors and timing', () => {
    expect(SPLASH_TITLE).toHaveLength(12);
    expect(SPLASH_TITLE_LETTERS).toHaveLength(12);
    expect(SPLASH_TITLE_LETTERS[0]).toEqual({ x: 35, y: 238 });
    expect(SPLASH_TITLE_LETTERS[8]).toEqual({ x: 450, y: 238 });
    expect(SPLASH_TIMING.wipeFrames).toBe(0xa1);
    expect(SPLASH_LOGOS.pole).toEqual({ x: 90, y: 60 });
    expect(SPLASH_CREDITS[0]?.y).toBe(2);
    expect(SPLASH_HELP).toHaveLength(4);
  });

  it('builds wipe / v-line / stripe geometry without framebuffer offsets', () => {
    expect(splashWipePolygon(0)).toContain('350');
    expect(splashWipePolygon(SPLASH_TIMING.wipeFrames - 1)).toContain('0,0');
    expect(splashVLinePaths(0)).toContain('x1="20"');
    expect(splashHStripeColumns().length).toBeGreaterThan(50);
    expect(splashVStripeRows().length).toBeGreaterThan(30);
  });

  it('emits splash overlay markup', () => {
    const svg = buildSplashSvgForTest();
    expect(svg).toContain('id="splash-root"');
    expect(svg).toContain('id="splash-wipe-clip"');
    expect(svg).toContain('id="splash-title"');
    expect(svg).toContain('display="none"');
  });
});
