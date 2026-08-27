import { describe, expect, it } from 'vitest';

import { moneyRecountStride } from './script';

describe('moneyRecountStride', () => {
  it('keeps the original 2 ms tick for modest stacks', () => {
    expect(moneyRecountStride(1)).toBe(1);
    expect(moneyRecountStride(100)).toBe(1);
    expect(moneyRecountStride(2000)).toBe(1);
  });

  it('batches coins so 2 ms ticks fit in 4 seconds', () => {
    expect(moneyRecountStride(2001)).toBe(2);
    expect(moneyRecountStride(4000)).toBe(2);
    expect(moneyRecountStride(10000)).toBe(5);
    const score = 50_000;
    const stride = moneyRecountStride(score);
    const ticks = Math.ceil(score / stride);
    expect(ticks * 2).toBeLessThanOrEqual(4000);
  });
});
