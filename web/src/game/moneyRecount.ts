const MONEY_RECOUNT_TICK_MS = 2;
const MONEY_RECOUNT_MAX_MS = 1000;

/** Balance ticks up in fixed 50 ₽ steps (drum sectors are multiples of 50). */
export const MONEY_RECOUNT_STEP = 50;

/** Stride per recount tick — always 50 ₽. */
export function moneyRecountStride(_delta: number): number {
  return MONEY_RECOUNT_STEP;
}

export { MONEY_RECOUNT_TICK_MS, MONEY_RECOUNT_MAX_MS };
