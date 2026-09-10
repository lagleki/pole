const MONEY_RECOUNT_TICK_MS = 2;
const MONEY_RECOUNT_MAX_MS = 1000;

/** How many coins share one original 2 ms tick — capped at 1 s total. */
export function moneyRecountStride(score: number): number {
  if (score <= 1) {
    return 1;
  }
  const maxTicks = Math.max(1, Math.floor(MONEY_RECOUNT_MAX_MS / MONEY_RECOUNT_TICK_MS));
  return Math.max(1, Math.ceil(score / maxTicks));
}

export { MONEY_RECOUNT_TICK_MS, MONEY_RECOUNT_MAX_MS };
