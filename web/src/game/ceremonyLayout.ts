/**
 * Named stage coordinates for prize / endgame / top-8 ceremony (presentation).
 * Pixel positions match the DOS screens; values are plain x/y, not framebuffer offsets.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CenteredPoint extends Point {
  readonly center: true;
}

/** Logo anchors shared by prize + endgame. */
export const CEREMONY_LOGOS = {
  pole: { x: 10, y: 10 } satisfies Point,
  chudes: { x: 200, y: 10 } satisfies Point,
} as const;

/** Endgame congrats body — flow fills `text`, layout supplies anchors. */
export const ENDGAME_LAYOUT = {
  greeting: { x: 240, y: 190, center: true } satisfies CenteredPoint,
  summary: { x: 240, y: 208, center: true } satisfies CenteredPoint,
  /** Basket header / gift intro. */
  body: { x: 76, y: 226 } satisfies Point,
  prizeLineStep: 18,
  /** Centered prize name when no basket list. */
  giftPrize: { x: 240, y: 244, center: true } satisfies CenteredPoint,
  addressHeader: { x: 112, y: 262 } satisfies Point,
  addressLine: { x: 100, y: 280 } satisfies Point,
  addressNote: { x: 56, y: 298 } satisfies Point,
  author: { x: 72, y: 332 } satisfies Point,
  authorContact: { x: 32, y: 341 } satisfies Point,
} as const;

/** Rising top-8 plaque on the right side of the stage. */
export const TOP8_LAYOUT = {
  card: { x: 480, y: 323, width: 152, height: 160 },
  /** DOS loop index at the start of the rise (2 px visible). */
  riseStartIndex: 79,
  titles: [
    { text: '8 лучших игроков,', x: 8, y: 5 },
    { text: 'выигравших ФИНАЛ!', x: 8, y: 19 },
  ] as const,
  /** First row inside the card. */
  row0: { rankX: 0, scoreX: 110, y: 44 },
  rowStrideY: 14,
  rowCount: 8,
} as const;

/** Screen Y of the plaque’s top edge for rise index i (79 → tucked, 0 → full). */
export function top8RiseY(i: number): number {
  const { card, riseStartIndex } = TOP8_LAYOUT;
  return card.y - 2 * (riseStartIndex - i);
}

/** Visible height of the plaque for rise index i. */
export function top8RiseH(i: number): number {
  return TOP8_LAYOUT.card.height - 2 * i;
}

export function top8RowY(rowIndex: number): number {
  return TOP8_LAYOUT.row0.y + rowIndex * TOP8_LAYOUT.rowStrideY;
}

/** Prize-sector congrats body (human bargains up to МИЛЛИОН). */
export const PRIZE_LAYOUT = {
  congrats: { x: 92, y: 208 },
  giftIntro: { x: 88, y: 226 },
  giftPrize: { x: 240, y: 244, center: true },
  addressHeader: { x: 112, y: 262 },
  addressLine: { x: 100, y: 280 },
  addressNote: { x: 56, y: 298 },
  author: { x: 72, y: 332 },
  authorContact: { x: 32, y: 341 },
  /** Scattered «руб» sprite bounds while taking money. */
  rubScatter: { maxX: 400, maxY: 295 },
} as const;
