/**
 * SVG studio chrome (DIFF #19). Depth, back to front:
 *   1. back wall with the board (bricks + marble overlay)
 *   2. wing openings — assistant walks here (dpr start 0x28,0x19)
 *   3. side walls: ordinary vertical rectangles, 90° to the board wall
 * Brick kinds still follow DIFF #15 (seeded RNG, restore uses i%3).
 */
import type { PaletteColor } from '../spec/types';
import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { defaultRenderSpec } from '../spec';
import { BOARD_OUTER } from './svgBoard';

export interface StudioView {
  setVisible(visible: boolean): void;
  setBricks(kinds: readonly number[]): void;
}

export const BRICK_COUNT = 36;
export const BRICK_COLS = 12;
export const BRICK_W = 54;
export const BRICK_H = 30;
export const BRICK_STRIDE_X = 52;
export const BRICK_STRIDE_Y = 31;
export const BRICK_ORIGIN_X = 5;
export const BRICK_ORIGIN_Y = 15;

export const LAMP_W = 16;
export const LAMP_H = 15;
export const LAMP_POS = [
  { x: 69, y: 3 },
  { x: 559, y: 3 },
] as const;

/** dpr: assistant walk starts at (0x28, 0x19) = (40, 25). */
export const ASSIST_WING_X = 40;
export const ASSIST_WALK_Y = 25;

/** DOS WALL_LEFT / WALL_RIGHT: 40×139 at y=25. Axis-aligned standing rects. */
export const WALL_W = 40;
export const WALL_H = 139;
export const WALL_Y = 25;
export const WALL_BOT = WALL_Y + WALL_H;
/** Inner-edge thickness facing the opening (the cut 90° to the board). */
export const WALL_JAMB = 6;
/** Back-wall pilaster beside the marble — the other jamb of the opening. */
export const BACK_JAMB = 12;

/** Upper studio (bands + bricks + lamps). Side-wall rects punch extra below. */
export const STUDIO_UPPER_H = 111;

export interface Point {
  x: number;
  y: number;
}

function ega(index: number): string {
  const color: PaletteColor | undefined = defaultRenderSpec.palette[index];
  if (!color) {
    return '#000000';
  }
  return `#${color[0].toString(16).padStart(2, '0')}${color[1].toString(16).padStart(2, '0')}${color[2].toString(16).padStart(2, '0')}`;
}

function mirrorX(x: number): number {
  return SCREEN_W - x;
}

export function brickXY(i: number): { x: number; y: number } {
  return {
    x: (i % BRICK_COLS) * BRICK_STRIDE_X + BRICK_ORIGIN_X,
    y: Math.floor(i / BRICK_COLS) * BRICK_STRIDE_Y + BRICK_ORIGIN_Y,
  };
}

/** Restore path: no extra RNG (dpr paint without random()). */
export function restoredBrickKinds(): number[] {
  return Array.from({ length: BRICK_COUNT }, (_, i) => i % 3);
}

export function wallRect(side: 'left' | 'right'): { x: number; y: number; w: number; h: number } {
  return side === 'left'
    ? { x: 0, y: WALL_Y, w: WALL_W, h: WALL_H }
    : { x: mirrorX(WALL_W), y: WALL_Y, w: WALL_W, h: WALL_H };
}

/** Left side-wall as a vertical rectangle (near row, 90° to the board). */
export function leftWallPoly(): Point[] {
  const r = wallRect('left');
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function rightWallPoly(): Point[] {
  const r = wallRect('right');
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function backWallRect(): { x: number; y: number; w: number; h: number } {
  return {
    x: BOARD_OUTER.x - BACK_JAMB,
    y: 13,
    w: BOARD_OUTER.w + BACK_JAMB * 2,
    h: 95,
  };
}

/** Opening between a side wall and the back wall with the board. */
export function wingGap(): { left: { x0: number; x1: number }; right: { x0: number; x1: number } } {
  const back = backWallRect();
  return {
    left: { x0: WALL_W, x1: back.x },
    right: { x0: back.x + back.w, x1: mirrorX(WALL_W) },
  };
}

export function studioPunchRects(): readonly { x: number; y: number; w: number; h: number }[] {
  return [{ x: 0, y: 0, w: SCREEN_W, h: STUDIO_UPPER_H }, wallRect('left'), wallRect('right')];
}

function punchRect(
  rgba: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const y0 = Math.max(0, y);
  const y1 = Math.min(VISIBLE_H, y + h);
  const x0 = Math.max(0, x);
  const x1 = Math.min(SCREEN_W, x + w);
  for (let py = y0; py < y1; py += 1) {
    const row = py * SCREEN_W * 4;
    for (let px = x0; px < x1; px += 1) {
      rgba[row + px * 4 + 3] = 0;
    }
  }
}

export function punchStudioHoles(rgba: Uint8ClampedArray): void {
  for (const { x, y, w, h } of studioPunchRects()) {
    punchRect(rgba, x, y, w, h);
  }
}

function polyAttr(pts: readonly Point[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/** Deterministic 0..1 wobble for cobble corners. */
function hash01(n: number): number {
  const t = Math.sin(n * 12.9898) * 43758.5453;
  return t - Math.floor(t);
}

/**
 * Irregular cobbles in local wall space (x=0 outer / screen edge, x=WALL_W inner).
 * Cyan highlight toward the hall light, navy grout like DOS WALL_LEFT.
 */
function cobblePolys(): { pts: Point[]; patch: Point[]; bright: boolean }[] {
  const rows = 9;
  const cols = 2;
  const cellW = (WALL_W - WALL_JAMB) / cols;
  const cellH = WALL_H / rows;
  const stones: { pts: Point[]; patch: Point[]; bright: boolean }[] = [];
  for (let r = 0; r < rows; r += 1) {
    const stagger = r % 2 === 0 ? 0 : cellW * 0.42;
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const x0 = Math.max(1.4, c * cellW + stagger);
      const x1 = Math.min(WALL_W - WALL_JAMB - 1, x0 + cellW * 0.9);
      if (x1 - x0 < 7) {
        continue;
      }
      const y0 = r * cellH + 1.4;
      const y1 = Math.min(WALL_H - 1.4, (r + 1) * cellH - 1.2);
      const dx = 1.6 * (hash01(i + 3) - 0.5);
      const dy = 1.4 * (hash01(i + 9) - 0.5);
      const pts = [
        { x: x0 + dx, y: y0 + dy * 0.4 },
        { x: x1 - 0.6 * dx, y: y0 + 0.8 * dy },
        { x: x1 + 0.4 * dx, y: y1 - dy },
        { x: x0 + 0.5 * dx, y: y1 + 0.3 * dy },
      ];
      const mx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
      const my = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
      const patch = [
        { x: pts[0].x * 0.55 + mx * 0.45, y: pts[0].y * 0.55 + my * 0.45 },
        { x: pts[1].x * 0.35 + mx * 0.65, y: pts[1].y * 0.45 + my * 0.55 },
        { x: mx + (hash01(i + 1) - 0.5) * 3, y: my + 1.5 },
        { x: pts[3].x * 0.4 + mx * 0.6, y: pts[3].y * 0.35 + my * 0.65 },
      ];
      stones.push({ bright: (r + c) % 2 === 0, pts, patch });
    }
  }
  return stones;
}

function brickSymbolsMarkup(): string {
  return `<symbol id="studio-brick-0" viewBox="0 0 ${BRICK_W} ${BRICK_H}">
        <rect width="${BRICK_W}" height="${BRICK_H}" fill="${ega(1)}"/>
        <rect x="3" y="4" width="48" height="22" rx="5" fill="url(#brick-blob)" stroke="${ega(11)}" stroke-width="1.4"/>
      </symbol>
      <symbol id="studio-brick-1" viewBox="0 0 ${BRICK_W} ${BRICK_H}">
        <rect width="${BRICK_W}" height="${BRICK_H}" fill="${ega(1)}"/>
        <rect x="2" y="3" width="24" height="24" rx="4" fill="url(#brick-blob)" stroke="${ega(11)}" stroke-width="1.3"/>
        <rect x="28" y="3" width="24" height="24" rx="4" fill="url(#brick-blob-b)" stroke="${ega(11)}" stroke-width="1.3"/>
      </symbol>
      <symbol id="studio-brick-2" viewBox="0 0 ${BRICK_W} ${BRICK_H}">
        <rect width="${BRICK_W}" height="${BRICK_H}" fill="${ega(1)}"/>
        <rect x="3" y="2" width="48" height="12" rx="3.5" fill="url(#brick-blob)" stroke="${ega(11)}" stroke-width="1.2"/>
        <rect x="3" y="16" width="30" height="12" rx="3.5" fill="url(#brick-blob-b)" stroke="${ega(11)}" stroke-width="1.2"/>
        <rect x="35" y="16" width="16" height="12" rx="3.5" fill="url(#brick-blob)" stroke="${ega(11)}" stroke-width="1.2"/>
      </symbol>`;
}

export function brickUsesMarkup(kinds: readonly number[]): string {
  return kinds
    .map((kind, i) => {
      const { x, y } = brickXY(i);
      const id = ((kind % 3) + 3) % 3;
      return `<use href="#studio-brick-${id}" x="${x}" y="${y}" width="${BRICK_W}" height="${BRICK_H}"/>`;
    })
    .join('');
}

function lampMarkup(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})">
      <rect x="7" y="0" width="2" height="5" rx="0.6" fill="${ega(7)}"/>
      <ellipse cx="8" cy="10.5" rx="7" ry="5.2" fill="url(#studio-lamp-glow)"/>
      <ellipse cx="6.2" cy="8.6" rx="2.2" ry="1.4" fill="${ega(15)}" opacity="0.55"/>
    </g>`;
}

function cobbleMarkup(): string {
  return cobblePolys()
    .map(({ pts, patch, bright }) => {
      const fill = bright ? 'url(#wall-stone)' : 'url(#wall-stone-dim)';
      return `<polygon points="${polyAttr(pts)}" fill="${fill}" stroke="${ega(1)}" stroke-width="1.1"/>
        <polygon points="${polyAttr(patch)}" fill="${ega(3)}" opacity="${bright ? 0.7 : 0.4}"/>`;
    })
    .join('');
}

function wallMarkup(side: 'left' | 'right'): string {
  const transform =
    side === 'left'
      ? `translate(0 ${WALL_Y})`
      : `translate(${SCREEN_W} ${WALL_Y}) scale(-1 1)`;
  const faceW = WALL_W - WALL_JAMB;
  return `<g class="studio-wall" id="studio-wall-${side}" data-side="${side}" transform="${transform}">
      <rect x="0" y="0" width="${WALL_W}" height="${WALL_H}" fill="url(#wall-grout)"/>
      <rect x="0" y="0" width="${faceW}" height="${WALL_H}" fill="url(#wall-face)"/>
      ${cobbleMarkup()}
      <rect x="${faceW}" y="0" width="${WALL_JAMB}" height="${WALL_H}" fill="url(#wall-jamb)"/>
      <rect x="0" y="0" width="${WALL_W}" height="3" fill="url(#wall-top)"/>
      <line x1="${WALL_W}" y1="0" x2="${WALL_W}" y2="${WALL_H}"
            stroke="${ega(0)}" stroke-width="1.3"/>
      <line x1="0" y1="0" x2="0" y2="${WALL_H}"
            stroke="${ega(1)}" stroke-width="1"/>
    </g>`;
}

function wingsMarkup(): string {
  const gap = wingGap();
  const back = backWallRect();
  const y = back.y;
  const h = back.h;
  const floorY = y + h - 12;
  const leftW = gap.left.x1 - gap.left.x0;
  const rightW = gap.right.x1 - gap.right.x0;
  return `<g id="studio-wings">
      <rect id="studio-wing-left" x="${gap.left.x0}" y="${y}" width="${leftW}" height="${h}"
            fill="url(#wing-void)"/>
      <rect x="${gap.left.x0}" y="${floorY}" width="${leftW}" height="12" fill="url(#wing-floor)"/>
      <rect id="studio-wing-right" x="${gap.right.x0}" y="${y}" width="${rightW}" height="${h}"
            fill="url(#wing-void)"/>
      <rect x="${gap.right.x0}" y="${floorY}" width="${rightW}" height="12" fill="url(#wing-floor)"/>
      <rect x="${back.x}" y="${back.y}" width="3" height="${back.h}" fill="url(#wall-jamb)"/>
      <rect x="${back.x + back.w - 3}" y="${back.y}" width="3" height="${back.h}"
            fill="url(#wall-jamb-r)"/>
    </g>`;
}

function bandsMarkup(): string {
  return `<g id="studio-bands">
      <rect x="0" y="0" width="${SCREEN_W}" height="10" fill="${ega(3)}"/>
      <rect x="0" y="10" width="${SCREEN_W}" height="3" fill="${ega(8)}"/>
      <rect x="0" y="13" width="${SCREEN_W}" height="95" fill="${ega(1)}"/>
      <rect x="0" y="108" width="${SCREEN_W}" height="3" fill="${ega(8)}"/>
    </g>`;
}

function wallDefsMarkup(): string {
  const teal = ega(3);
  const blue = ega(9);
  const navy = ega(1);
  const black = ega(0);
  return `<linearGradient id="wall-stone" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${teal}"/>
        <stop offset="38%" stop-color="${blue}"/>
        <stop offset="100%" stop-color="${navy}"/>
      </linearGradient>
      <linearGradient id="wall-stone-dim" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${blue}"/>
        <stop offset="55%" stop-color="${navy}"/>
        <stop offset="100%" stop-color="${black}"/>
      </linearGradient>
      <linearGradient id="wall-face" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${blue}"/>
        <stop offset="70%" stop-color="${navy}"/>
        <stop offset="100%" stop-color="${black}"/>
      </linearGradient>
      <linearGradient id="wall-grout" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${navy}"/>
        <stop offset="100%" stop-color="${black}"/>
      </linearGradient>
      <linearGradient id="wall-jamb" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${navy}"/>
        <stop offset="100%" stop-color="${black}"/>
      </linearGradient>
      <linearGradient id="wall-jamb-r" x1="1" y1="0" x2="0" y2="0">
        <stop offset="0%" stop-color="${navy}"/>
        <stop offset="100%" stop-color="${black}"/>
      </linearGradient>
      <linearGradient id="wall-top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${teal}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${navy}"/>
      </linearGradient>
      <linearGradient id="wing-void" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000010"/>
        <stop offset="70%" stop-color="#000000"/>
        <stop offset="100%" stop-color="#1a1a22"/>
      </linearGradient>
      <linearGradient id="wing-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a2a33"/>
        <stop offset="100%" stop-color="${ega(8)}"/>
      </linearGradient>
      <linearGradient id="brick-blob" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stop-color="${ega(5)}"/>
        <stop offset="55%" stop-color="${ega(13)}"/>
        <stop offset="100%" stop-color="${ega(9)}"/>
      </linearGradient>
      <linearGradient id="brick-blob-b" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stop-color="${ega(13)}"/>
        <stop offset="100%" stop-color="${ega(1)}"/>
      </linearGradient>`;
}

export function buildStudioSvg(kinds: readonly number[] = restoredBrickKinds()): string {
  const back = backWallRect();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="studio-lamp-glow" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stop-color="${ega(14)}"/>
          <stop offset="45%" stop-color="${ega(10)}"/>
          <stop offset="100%" stop-color="${ega(2)}"/>
        </radialGradient>
        ${wallDefsMarkup()}
        ${brickSymbolsMarkup()}
        <clipPath id="studio-back-clip">
          <rect x="${back.x}" y="${back.y}" width="${back.w}" height="${back.h}"/>
        </clipPath>
      </defs>
      <g id="studio-root" display="none">
        ${bandsMarkup()}
        <g id="studio-bricks" clip-path="url(#studio-back-clip)">${brickUsesMarkup(kinds)}</g>
        ${wingsMarkup()}
        <g id="studio-lamps">${LAMP_POS.map((p) => lampMarkup(p.x, p.y)).join('')}</g>
        ${wallMarkup('left')}
        ${wallMarkup('right')}
      </g>
    </svg>`;
}

export function mountSvgStudio(host: HTMLElement): StudioView {
  host.innerHTML = buildStudioSvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#studio-root');
  const bricks = host.querySelector<SVGGElement>('#studio-bricks');
  if (!root || !bricks) {
    throw new Error('SVG studio mount failed');
  }

  return {
    setVisible(visible: boolean): void {
      if (visible) {
        root.setAttribute('display', 'inline');
      } else {
        root.setAttribute('display', 'none');
      }
      host.hidden = !visible;
    },
    setBricks(kinds: readonly number[]): void {
      bricks.innerHTML = brickUsesMarkup(kinds);
    },
  };
}
