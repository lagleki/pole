import { describe, expect, it } from 'vitest';

import { buildSuperWheelSvg } from './svgWheel';
import { SUPER_WHEEL_SECTOR_COUNT, superWheelPrizes } from './superWheel';

describe('superWheel', () => {
  it('lists seven drum super-prizes', () => {
    expect(superWheelPrizes()).toHaveLength(SUPER_WHEEL_SECTOR_COUNT);
  });

  it('renders seven wedges in the super wheel SVG', () => {
    const svg = buildSuperWheelSvg();
    const wedgeCount = (svg.match(/transform="rotate\(/g) ?? []).length;
    expect(wedgeCount).toBeGreaterThanOrEqual(7);
    for (const prize of superWheelPrizes()) {
      expect(svg).toContain(prize.slice(0, 6));
    }
  });
});
