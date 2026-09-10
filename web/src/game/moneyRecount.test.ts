import { describe, expect, it } from 'vitest';

import { MONEY_RECOUNT_STEP, moneyRecountStride } from './moneyRecount';

function recountMs(delta: number): number {
  const stride = moneyRecountStride(delta);
  const ticks = Math.ceil(delta / stride);
  return ticks * 2;
}

describe('moneyRecountStride', () => {
  it('always steps by 50 rubles', () => {
    expect(MONEY_RECOUNT_STEP).toBe(50);
    expect(moneyRecountStride(1)).toBe(50);
    expect(moneyRecountStride(350)).toBe(50);
    expect(moneyRecountStride(500)).toBe(50);
    expect(moneyRecountStride(10_000)).toBe(50);
  });

  it('keeps typical drum awards under a couple seconds', () => {
    expect(recountMs(350)).toBe(14); // 7 steps × 2 ms
    expect(recountMs(1000)).toBe(40);
    expect(recountMs(5000)).toBe(200);
    expect(recountMs(10_000)).toBeLessThanOrEqual(3000);
    expect(recountMs(50_000)).toBeLessThanOrEqual(3000);
  });
});
