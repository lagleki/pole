import { describe, expect, it } from 'vitest';

import { moneyRecountStride } from './script';

function recountMs(score: number): number {
  const stride = moneyRecountStride(score);
  const ticks = Math.ceil(score / stride);
  return ticks * 2;
}

describe('moneyRecountStride', () => {
  it('keeps a 2 ms tick for typical three-digit drum scores', () => {
    expect(moneyRecountStride(1)).toBe(1);
    expect(moneyRecountStride(350)).toBe(1);
    expect(moneyRecountStride(500)).toBe(1);
    expect(recountMs(350)).toBeLessThanOrEqual(1000);
    expect(recountMs(9999)).toBeLessThanOrEqual(1000);
  });

  it('caps under 10k at 1 s and larger stacks at 3 s', () => {
    expect(recountMs(2000)).toBeLessThanOrEqual(1000);
    expect(recountMs(9999)).toBeLessThanOrEqual(1000);
    expect(recountMs(10_000)).toBeLessThanOrEqual(3000);
    expect(recountMs(50_000)).toBeLessThanOrEqual(3000);
  });
});
