/**
 * Named splash-screen layout (presentation).
 * Timing frame counts match DOS; coordinates are plain stage x/y.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export const SPLASH_STAGE = { width: 640, height: 350 } as const;

/** Intro wipe / stripe frame counts (inclusive loops in the original). */
export const SPLASH_TIMING = {
  wipeFrames: 0xa0 + 1,
  wipeFrameMs: 10,
  afterWipeMs: 500,
  vLineFrames: 0xa0 + 1,
  vLineFrameMs: 10,
  hStripeFrameMs: 10,
  vStripeFrameMs: 10,
  afterStripesMs: 2500,
  afterLogosMs: 2500,
  titleLetterMs: 250,
  titleBeepStartHz: 100,
  titleBeepStepHz: 100,
  titleBeepMs: 10,
} as const;

export const SPLASH_LOGOS = {
  pole: { x: 90, y: 60 } satisfies Point,
  chudes: { x: 280, y: 60 } satisfies Point,
} as const;

/** Title string including leading/trailing spaces (12 glyphs). */
export const SPLASH_TITLE = ' КАПИТАЛШОУ ';

/**
 * Per-glyph stage anchors for the title row (y = 238).
 * Extra gap before «О» matches the original +15 nudge at letter index 9.
 */
export const SPLASH_TITLE_LETTERS: readonly Point[] = [
  { x: 35, y: 238 },
  { x: 85, y: 238 },
  { x: 135, y: 238 },
  { x: 185, y: 238 },
  { x: 235, y: 238 },
  { x: 285, y: 238 },
  { x: 335, y: 238 },
  { x: 385, y: 238 },
  { x: 450, y: 238 },
  { x: 500, y: 238 },
  { x: 550, y: 238 },
  { x: 600, y: 238 },
];

export interface SplashTextLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  /** EGA palette index. */
  readonly color: number;
  /** Extra letter-spacing in px (0 = tight 8px cells). */
  readonly tracking?: number;
}

export const SPLASH_CREDITS: readonly SplashTextLine[] = [
  {
    text: 'Сделал Дима Башуров из Арзамаса-16 (E-Mail: 0669@RFNC.NNOV.SU )',
    x: 68,
    y: 2,
    color: 7,
  },
  {
    text: 'Телефон в Арзамасе-16: (83130) 5-92-73',
    x: 176,
    y: 12,
    color: 7,
  },
  {
    text: 'Посвящается друзьям',
    x: 80,
    y: 27,
    color: 0,
    tracking: 17,
  },
  {
    text: 'Посвящается друзьям',
    x: 80,
    y: 28,
    color: 0,
    tracking: 17,
  },
];

/** Black help band behind the footer tips. */
export const SPLASH_HELP_BAND = { x: 0, y: 308, width: 640, height: 70 } as const;

export const SPLASH_HELP: readonly SplashTextLine[] = [
  {
    text: 'СПРАВКА: Для перемещения своей руки использйте клавиши со стрелками или',
    x: 27,
    y: 310,
    color: 7,
  },
  {
    text: '"мышку". Ввод осуществляется нажатием на клавишу ПРОБЕЛ или на',
    x: 99,
    y: 320,
    color: 7,
  },
  {
    text: 'левую кнопку"мышки". Нажатие <Ctrl+S> включает/выключает звук,',
    x: 99,
    y: 330,
    color: 7,
  },
  {
    text: 'если пришел начальник, нажми клавишу TAB, ESC - выход из игры!',
    x: 99,
    y: 340,
    color: 7,
  },
];

/** Horizontal lattice cells painted during the stripe phase. */
export function splashHStripeCells(): readonly { x: number; y: number; w: number; h: number }[] {
  const cells: { x: number; y: number; w: number; h: number }[] = [];
  for (let x = 20; x <= 610; x += 10) {
    for (let row = 0; row <= 8; row += 1) {
      cells.push({ x, y: 25 + row * 40, w: 10, h: 3 });
    }
  }
  return cells;
}

/** Vertical lattice cells painted during the stripe phase. */
export function splashVStripeCells(): readonly { x: number; y: number; w: number; h: number }[] {
  const cells: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 25; y <= 337; y += 8) {
    for (let col = 0; col <= 12; col += 1) {
      cells.push({ x: 19 + col * 50, y, w: 3, h: 8 });
    }
  }
  return cells;
}

/** Column-major H-stripe groups (one wait per column in DOS). */
export function splashHStripeColumns(): readonly { x: number; y: number; w: number; h: number }[][] {
  const cols: { x: number; y: number; w: number; h: number }[][] = [];
  for (let x = 20; x <= 610; x += 10) {
    const col: { x: number; y: number; w: number; h: number }[] = [];
    for (let row = 0; row <= 8; row += 1) {
      col.push({ x, y: 25 + row * 40, w: 10, h: 3 });
    }
    cols.push(col);
  }
  return cols;
}

/** Row-major V-stripe groups (one wait per row in DOS). */
export function splashVStripeRows(): readonly { x: number; y: number; w: number; h: number }[][] {
  const rows: { x: number; y: number; w: number; h: number }[][] = [];
  for (let y = 25; y <= 337; y += 8) {
    const row: { x: number; y: number; w: number; h: number }[] = [];
    for (let col = 0; col <= 12; col += 1) {
      row.push({ x: 19 + col * 50, y, w: 3, h: 8 });
    }
    rows.push(row);
  }
  return rows;
}
