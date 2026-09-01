import { describe, expect, it } from 'vitest';

import { BorlandRng } from '../engine/rng';
import {
  SUPERGAME_MAX_TOTAL,
  SUPERGAME_MIN_TOTAL,
  SUPERGAME_PRIZE_POOL,
  basketTotal,
  buildPrizeBasket,
} from './supergamePrizes';

describe('supergamePrizes', () => {
  it('has a large enough catalog', () => {
    expect(SUPERGAME_PRIZE_POOL.length).toBeGreaterThanOrEqual(30);
  });

  it('builds a deterministic basket for a fixed seed', () => {
    const rng = new BorlandRng(42);
    const basketA = buildPrizeBasket(12_000, { nextInt: (n) => rng.random(n) });
    const rng2 = new BorlandRng(42);
    const basketB = buildPrizeBasket(12_000, { nextInt: (n) => rng2.random(n) });
    expect(basketA).toEqual(basketB);
    expect(basketA.length).toBeGreaterThanOrEqual(5);
  });

  it('totals roughly 10 000 rubles', () => {
    const rng = new BorlandRng(7);
    const basket = buildPrizeBasket(8000, { nextInt: (n) => rng.random(n) });
    const total = basketTotal(basket);
    expect(total).toBeGreaterThanOrEqual(SUPERGAME_MIN_TOTAL);
    expect(total).toBeLessThanOrEqual(SUPERGAME_MAX_TOTAL);
  });
});
