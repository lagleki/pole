/**
 * Named studio floor geometry + parquet presentation (DIFF #19).
 * Presentation-only — game flow never draws the floor (no DOS fillRect).
 *
 * Floor fill + tile grid start at DOS floorRect.y (board wall ≈ 111).
 * Perspective trapezoid keeps the side angles but extends to that wall and
 * widens past the screen edges so side gaps are closed (old CSS span≈3×).
 */
import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { defaultRenderSpec } from '../spec';
import type { PaletteColor } from '../spec/types';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface FloorQuad {
  readonly topLeft: Point;
  readonly topRight: Point;
  readonly bottomLeft: Point;
  readonly bottomRight: Point;
}

/** DOS floorRect.y / studio upper band height. */
export const FLOOR_FILL_Y = defaultRenderSpec.stage.floorRect.y;

/** Side-wall width (DOS WALL_LEFT / WALL_RIGHT). */
export const FLOOR_WALL_INSET = 40;

/** Board-wall horizon for the tile grid (same as floor fill / studio upper). */
export const FLOOR_BACK_Y = FLOOR_FILL_Y;

/**
 * Top edge of the perspective grid at the board wall.
 * Slightly inside the side walls so seams read clean; still wider than the
 * old WALL_BOT inset (40…600 at y=164) relative to depth.
 */
export const FLOOR_BACK_LEFT_X = 8;
export const FLOOR_BACK_RIGHT_X = SCREEN_W - 8;

/** Extra screens of floor past each side at the near edge (closes side gaps). */
export const FLOOR_SIDE_OVERHANG = SCREEN_W;

/** Tile counts across the trapezoid (front edge / depth). */
export const FLOOR_TILE_COLS = 18;
export const FLOOR_TILE_ROWS = 12;

function egaHex(color: PaletteColor): string {
  return `#${color[0]!.toString(16).padStart(2, '0')}${color[1]!.toString(16).padStart(2, '0')}${color[2]!.toString(16).padStart(2, '0')}`;
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** DOS palette index 7 (floorRect.fillColor) as the ceramic mid-tone. */
const FLOOR_MID = egaHex(defaultRenderSpec.palette[defaultRenderSpec.stage.floorRect.fillColor]!);

/**
 * Presentation ceramic pair — clear grout vs face contrast (the old CSS 3D path
 * set face = palette #7 `#aaaaaa` against grout `#8f8f8f`, which read as flat).
 */
export const FLOOR_COLORS = {
  /** Solid underlay / odd tiles. */
  face: lighten(FLOOR_MID, 28),
  /** Checker alternate. */
  faceAlt: darken(FLOOR_MID, 6),
  /** Grout / grid stroke — palette 8 dark gray. */
  grout: egaHex(defaultRenderSpec.palette[8]!),
  /** Wall band above the floor when studio chrome is hidden. */
  wallBand: '#d8d8d8',
} as const;

export function studioFloorQuad(): FloorQuad {
  return {
    topLeft: { x: FLOOR_BACK_LEFT_X, y: FLOOR_BACK_Y },
    topRight: { x: FLOOR_BACK_RIGHT_X, y: FLOOR_BACK_Y },
    // Widen the near edge past the viewport so perspective sides fill the gaps.
    bottomLeft: { x: -FLOOR_SIDE_OVERHANG, y: VISIBLE_H },
    bottomRight: { x: SCREEN_W + FLOOR_SIDE_OVERHANG, y: VISIBLE_H },
  };
}

export function stageFloorClipPercents(): {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
} {
  const q = studioFloorQuad();
  return {
    topLeft: { x: (q.topLeft.x / SCREEN_W) * 100, y: (q.topLeft.y / VISIBLE_H) * 100 },
    topRight: { x: (q.topRight.x / SCREEN_W) * 100, y: (q.topRight.y / VISIBLE_H) * 100 },
    bottomLeft: { x: (q.bottomLeft.x / SCREEN_W) * 100, y: (q.bottomLeft.y / VISIBLE_H) * 100 },
    bottomRight: { x: (q.bottomRight.x / SCREEN_W) * 100, y: (q.bottomRight.y / VISIBLE_H) * 100 },
  };
}

export function stageFloorClipPath(): string {
  const p = stageFloorClipPercents();
  return `polygon(${p.topLeft.x}% ${p.topLeft.y}%, ${p.topRight.x}% ${p.topRight.y}%, ${p.bottomRight.x}% ${p.bottomRight.y}%, ${p.bottomLeft.x}% ${p.bottomLeft.y}%)`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map depth 0 (horizon) … 1 (front) with mild foreshortening. */
export function floorDepthT(rowIndex: number, rows: number = FLOOR_TILE_ROWS): number {
  const u = rowIndex / rows;
  // Ease toward the front so near tiles are larger (1/z-ish without a full camera).
  return u * u * (3 - 2 * u);
}

export function floorPointAt(quad: FloorQuad, depthT: number, acrossT: number): Point {
  const xL = lerp(quad.topLeft.x, quad.bottomLeft.x, depthT);
  const xR = lerp(quad.topRight.x, quad.bottomRight.x, depthT);
  const yL = lerp(quad.topLeft.y, quad.bottomLeft.y, depthT);
  const yR = lerp(quad.topRight.y, quad.bottomRight.y, depthT);
  return {
    x: lerp(xL, xR, acrossT),
    y: lerp(yL, yR, acrossT),
  };
}

export interface FloorTileQuad {
  readonly row: number;
  readonly col: number;
  readonly points: string;
  readonly fill: string;
}

/** Perspective-mapped tile quads (checker fill) for the SVG floor. */
export function floorTileQuads(
  cols: number = FLOOR_TILE_COLS,
  rows: number = FLOOR_TILE_ROWS,
): FloorTileQuad[] {
  const quad = studioFloorQuad();
  const out: FloorTileQuad[] = [];
  for (let r = 0; r < rows; r += 1) {
    const t0 = floorDepthT(r, rows);
    const t1 = floorDepthT(r + 1, rows);
    for (let c = 0; c < cols; c += 1) {
      const u0 = c / cols;
      const u1 = (c + 1) / cols;
      const p00 = floorPointAt(quad, t0, u0);
      const p10 = floorPointAt(quad, t0, u1);
      const p11 = floorPointAt(quad, t1, u1);
      const p01 = floorPointAt(quad, t1, u0);
      const fill = (r + c) % 2 === 0 ? FLOOR_COLORS.face : FLOOR_COLORS.faceAlt;
      out.push({
        row: r,
        col: c,
        fill,
        points: `${p00.x},${p00.y} ${p10.x},${p10.y} ${p11.x},${p11.y} ${p01.x},${p01.y}`,
      });
    }
  }
  return out;
}

/** CSS custom properties applied on `#stage-backdrop` (presentation tokens). */
export function studioFloorCssVars(): Readonly<Record<string, string>> {
  return {
    '--stage-floor-base': FLOOR_COLORS.face,
    '--stage-tile-face': FLOOR_COLORS.face,
    '--stage-tile-face-alt': FLOOR_COLORS.faceAlt,
    '--stage-tile-grout': FLOOR_COLORS.grout,
    '--stage-wall-top': FLOOR_COLORS.wallBand,
    '--stage-floor-top-pct': `${(FLOOR_FILL_Y / VISIBLE_H) * 100}%`,
  };
}

/**
 * SVG parquet: perspective-mapped tiles from the board wall to the near edge,
 * with a full-width underlay so no blank strip remains above the old WALL_BOT.
 */
export function studioFloorSvgMarkup(): string {
  const tiles = floorTileQuads()
    .map(
      (t) =>
        `<polygon class="stage-floor-tile" data-row="${t.row}" data-col="${t.col}" points="${t.points}" fill="${t.fill}"/>`,
    )
    .join('');
  const fillH = VISIBLE_H - FLOOR_FILL_Y;
  const q = studioFloorQuad();
  const underlay = `${q.topLeft.x},${q.topLeft.y} ${q.topRight.x},${q.topRight.y} ${q.bottomRight.x},${q.bottomRight.y} ${q.bottomLeft.x},${q.bottomLeft.y}`;
  return `<svg class="stage-floor-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCREEN_W} ${VISIBLE_H}"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect class="stage-floor-fill" x="0" y="${FLOOR_FILL_Y}" width="${SCREEN_W}" height="${fillH}" fill="${FLOOR_COLORS.face}"/>
      <polygon class="stage-floor-underlay" points="${underlay}" fill="${FLOOR_COLORS.face}"/>
      <g id="stage-floor-tiles" class="stage-floor-tiles" stroke="${FLOOR_COLORS.grout}" stroke-width="1.25" stroke-linejoin="miter">
        ${tiles}
      </g>
    </svg>`;
}

export function stageBackdropMarkup(): string {
  return `<div class="stage-wall-band"></div>
    <div class="stage-floor">
      ${studioFloorSvgMarkup()}
    </div>`;
}

/** @deprecated name kept for tests; backdrop is CSS band + SVG parquet. */
export function buildStageBackdropSvg(): string {
  return stageBackdropMarkup();
}

export function mountStageBackdrop(host: HTMLElement): void {
  const vars = studioFloorCssVars();
  for (const [key, value] of Object.entries(vars)) {
    host.style.setProperty(key, value);
  }
  host.innerHTML = stageBackdropMarkup();
}
