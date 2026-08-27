import { describe, expect, it } from 'vitest';

import {
  SPIN_CRUISE_MS,
  SPIN_DURATION_JITTER_MS,
  SPIN_DURATION_MS,
  SPIN_LAST_MS,
  spinEase,
  spinFrictionProgress,
  spinStepDelayMs,
  TV_POINT_VALUES,
  WHEEL_SECTOR_COUNT,
  WHEEL_SECTORS,
  wheelSectorLabel,
} from './tvWheel';

describe('TV 36-sector drum (DIFF #26)', () => {
  it('has 36 sectors and every listed point value twice', () => {
    expect(WHEEL_SECTORS).toHaveLength(WHEEL_SECTOR_COUNT);
    const points = WHEEL_SECTORS.filter((s) => s.kind === 'points');
    expect(points).toHaveLength(28);
    for (const value of TV_POINT_VALUES) {
      expect(points.filter((s) => s.value === value).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes the classic specials without key or chance', () => {
    const kinds = WHEEL_SECTORS.map((s) => s.kind);
    expect(kinds.filter((k) => k === 'bankrupt')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'prize')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'plus')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'x2')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'zero')).toHaveLength(1);
  });

  it('never places the same point value on neighbouring wedges', () => {
    for (let i = 0; i < WHEEL_SECTORS.length; i += 1) {
      const a = WHEEL_SECTORS[i];
      const b = WHEEL_SECTORS[(i + 1) % WHEEL_SECTORS.length];
      if (a.kind === 'points' && b.kind === 'points') {
        expect(a.value, `sectors ${i} and ${(i + 1) % WHEEL_SECTORS.length}`).not.toBe(b.value);
      }
    }
  });

  it('labels specials for the SVG rim', () => {
    expect(wheelSectorLabel({ kind: 'bankrupt' })).toBe('Б');
    expect(wheelSectorLabel({ kind: 'prize' })).toBe('П');
    expect(wheelSectorLabel({ kind: 'points', value: 1000 })).toBe('1000');
  });
});

describe('cruise-then-brake spin delays', () => {
  it('stays near cruise for the first ticks and creeps on the last', () => {
    const n = 144;
    const first = spinStepDelayMs(0, n);
    const early = spinStepDelayMs(40, n);
    const last = spinStepDelayMs(n - 1, n);
    expect(first).toBeCloseTo(SPIN_CRUISE_MS, 5);
    expect(early).toBeGreaterThan(first);
    expect(early).toBeLessThan(SPIN_CRUISE_MS + (SPIN_LAST_MS - SPIN_CRUISE_MS) * 0.35);
    expect(last).toBeCloseTo(SPIN_LAST_MS, 5);
    expect(last).toBeGreaterThan(400);
  });

  it('eases out under Coulomb+viscous friction (more angle early, crawl at the end)', () => {
    expect(spinEase(0)).toBe(0);
    expect(spinEase(1)).toBe(1);
    expect(spinFrictionProgress(0.5)).toBeGreaterThan(0.65);
    expect(spinFrictionProgress(0.5)).toBeLessThan(0.9);
    expect(spinFrictionProgress(0.9)).toBeGreaterThan(0.95);
    const v0 = spinFrictionProgress(0.1) - spinFrictionProgress(0);
    const vMid = spinFrictionProgress(0.55) - spinFrictionProgress(0.45);
    const vEnd = spinFrictionProgress(1) - spinFrictionProgress(0.9);
    expect(v0).toBeGreaterThan(vMid);
    expect(vMid).toBeGreaterThan(vEnd);
  });

  it('averages about nine seconds of spin', () => {
    expect(SPIN_DURATION_MS + (SPIN_DURATION_JITTER_MS - 1) / 2).toBe(9000);
  });
});
