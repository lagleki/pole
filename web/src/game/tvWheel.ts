/**
 * Classic 36-sector TV drum (DIFF #26), not the DOS 16-wedge table.
 * Point values and specials follow the 1993 «Поле чудес» wheel description.
 */

export const WHEEL_SECTOR_COUNT = 36;

export const TV_POINT_VALUES = [
  350, 400, 450, 500, 600, 650, 700, 750, 800, 850, 950, 1000,
] as const;

export type TvSector =
  | { kind: 'points'; value: number }
  | { kind: 'bankrupt' }
  | { kind: 'prize' }
  | { kind: 'plus' }
  | { kind: 'x2' }
  | { kind: 'zero' };

const P = (value: number): TvSector => ({ kind: 'points', value });

/**
 * Clockwise from the arrow (index 0). 26 point sectors and 10 specials:
 * bankrupt×1 (Б), prize×1 (П), plus×2, x2×2, zero×4. No key/chance.
 * Zeros sit every 9 wedges (0/9/18/27). Plus, ×2 and bankrupt/prize sit in
 * opposite pairs in the gaps so specials are never adjacent.
 * Same point value never sits on two neighbouring wedges (including wrap).
 */
export const WHEEL_SECTORS: readonly TvSector[] = [
  { kind: 'zero' },
  P(500),
  P(350),
  { kind: 'plus' },
  P(800),
  P(650),
  { kind: 'bankrupt' },
  P(400),
  P(1000),
  { kind: 'zero' },
  P(450),
  P(850),
  P(600),
  { kind: 'x2' },
  P(950),
  P(400),
  P(700),
  P(500),
  { kind: 'zero' },
  P(350),
  P(800),
  { kind: 'plus' },
  P(650),
  P(750),
  { kind: 'prize' },
  P(1000),
  P(500),
  { kind: 'zero' },
  P(450),
  P(700),
  P(850),
  { kind: 'x2' },
  P(600),
  P(950),
  P(700),
  P(750),
];

export function wheelSectorLabel(sector: TvSector): string {
  switch (sector.kind) {
    case 'points':
      return String(sector.value);
    case 'bankrupt':
      return 'Б';
    case 'prize':
      return 'П';
    case 'plus':
      return '+';
    case 'x2':
      return '×2';
    case 'zero':
      return '0';
  }
}

export function wheelSectorLabelFontSize(label: string): number {
  if (label.length === 1) {
    return 18;
  }
  if (label.length >= 4) {
    return 8;
  }
  if (/^\d{3}$/.test(label)) {
    return 9;
  }
  return 13;
}

/**
 * Spin timing (DIFF #26): Coulomb + viscous friction.
 * ω̇ = −α − βω, wheel stops at T (mean ~9 s). `u` in [0,1] is t/T;
 * the returned value is the travelled fraction of the total angle.
 */
export const WHEEL_STEP_DEG = 360 / WHEEL_SECTOR_COUNT;
/** Mean duration at 1.8 turns; scaled by actual revolutions (DIFF #26). */
export const SPIN_DURATION_MS = 8000;
export const SPIN_DURATION_JITTER_MS = 2001;
export const SPIN_FRAME_MS = 16;
export const SPIN_MIN_TURNS = 1.1;
export const SPIN_MAX_TURNS = 2.5;
/** Hold Space this long on «Кручу барабан» to reach SPIN_MAX_TURNS. */
export const SPIN_HOLD_FULL_MS = 2000;

/** Milliturns in [1100, 2500]. Tap/NPC: uniform random. Hold: lerp by hold time. */
export function spinMilliturns(holdMs: number, randomMilliturns: number): number {
  const span = Math.round((SPIN_MAX_TURNS - SPIN_MIN_TURNS) * 1000);
  const min = Math.round(SPIN_MIN_TURNS * 1000);
  if (holdMs <= 0) {
    return min + Math.max(0, Math.min(span, randomMilliturns));
  }
  const t = Math.min(1, holdMs / SPIN_HOLD_FULL_MS);
  return min + Math.round(t * span);
}

export function spinStepsFromMilliturns(milliturns: number, sectorCount: number): number {
  return Math.max(1, Math.round((milliturns / 1000) * sectorCount));
}
/** βω₀/α at t=0 — viscous vs dry friction. */
export const SPIN_VISCOUS_RATIO = 1.6;

export function spinFrictionProgress(u: number, lambda = SPIN_VISCOUS_RATIO): number {
  const t = Math.min(1, Math.max(0, u));
  if (t === 0) {
    return 0;
  }
  if (t === 1 || lambda <= 0) {
    return t === 0 ? 0 : 2 * t - t * t;
  }
  const k = Math.log(1 + lambda);
  const theta = (uu: number): number => {
    const boost = (lambda + 1) / lambda;
    return (boost * (1 - Math.exp(-k * uu))) / k - uu / lambda;
  };
  return theta(t) / theta(1);
}

export function spinEase(u: number): number {
  return spinFrictionProgress(u);
}

/** @deprecated Kept for tests that inspect the old per-wedge table. */
export const SPIN_CRUISE_MS = 95;
export const SPIN_LAST_MS = 560;
export const SPIN_BRAKE_POWER = 2.6;

export function spinStepDelayMs(step: number, totalSteps: number): number {
  if (totalSteps <= 0) {
    return SPIN_CRUISE_MS;
  }
  if (totalSteps === 1) {
    return SPIN_LAST_MS;
  }
  const u = Math.min(1, Math.max(0, step / (totalSteps - 1)));
  return SPIN_CRUISE_MS + (SPIN_LAST_MS - SPIN_CRUISE_MS) * u ** SPIN_BRAKE_POWER;
}

