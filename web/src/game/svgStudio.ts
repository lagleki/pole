/**
 * SVG studio chrome (DIFF #19). Scenic stack (all behind canvas/HUD):
 *   1. full-width back wall (bricks + swirls + lamps)
 *   2. marble board overlay
 *   3. assistant walk (x = 0 … SCREEN_W at y = 25)
 *   4. side walls (she passes between 1/2 and these)
 * Brick kinds still follow DIFF #15 (seeded RNG, restore uses i%3).
 */
import type { PaletteColor } from '../spec/types';
import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { defaultRenderSpec } from '../spec';
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

/** Bulb centers in screen space (hang + ellipse). */
export function lampBulbs(): readonly { x: number; y: number }[] {
  return LAMP_POS.map((p) => ({ x: p.x + 8, y: p.y + 10.5 }));
}

/**
 * Soft point-light irradiance (simple 3D-ish falloff in screen space).
 * I = Σ 1 / (1 + a·d²) — diffuse fill without a full path tracer.
 */
export function lampIrradiance(x: number, y: number): number {
  let sum = 0;
  for (const lamp of lampBulbs()) {
    const dx = x - lamp.x;
    const dy = y - lamp.y;
    sum += 1 / (1 + 0.00007 * (dx * dx + dy * dy));
  }
  return sum;
}

/** Assistant walk row (screen y). Full-width path so she eases past the side walls. */
export const ASSIST_WALK_Y = 25;
/** Left edge of the screen — she enters from behind the left side wall. */
export const ASSIST_WALK_X0 = 0;
/** Past the right edge — she exits behind the right side wall (sprite is 25px). */
export const ASSIST_WALK_X1 = SCREEN_W;
/** @deprecated alias kept for older call sites; wing is no longer inset. */
export const ASSIST_WING_X = ASSIST_WALK_X0;

/** DOS WALL_LEFT / WALL_RIGHT: 40×139 at y=25. Axis-aligned standing rects. */
export const WALL_W = 40;
export const WALL_H = 139;
export const WALL_Y = 25;
export const WALL_BOT = WALL_Y + WALL_H;
/** Inner-edge thickness facing the hall (the cut 90° to the board). */
export const WALL_JAMB = 6;

/** Upper studio (bands + bricks + lamps). Side-wall rects punch extra below. */
export const STUDIO_UPPER_H = 111;
/** Back wall band behind the marble board (full screen width). */
export const BACK_WALL_Y = 13;
export const BACK_WALL_H = 95;

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

/** Full-width wall behind the board (bricks span the screen). */
export function backWallRect(): { x: number; y: number; w: number; h: number } {
  return { x: 0, y: BACK_WALL_Y, w: SCREEN_W, h: BACK_WALL_H };
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
  const stroke = '#f0e0c8';
  return `<symbol id="studio-brick-0" viewBox="0 0 ${BRICK_W} ${BRICK_H}">
        <rect width="${BRICK_W}" height="${BRICK_H}" fill="url(#brick-grout)"/>
        <rect x="3" y="4" width="48" height="22" rx="6" fill="url(#brick-blob)" stroke="${stroke}" stroke-width="1.3"/>
        <ellipse cx="14" cy="10" rx="7" ry="3.5" fill="#fff8e8" opacity="0.45"/>
      </symbol>
      <symbol id="studio-brick-1" viewBox="0 0 ${BRICK_W} ${BRICK_H}">
        <rect width="${BRICK_W}" height="${BRICK_H}" fill="url(#brick-grout)"/>
        <rect x="2" y="3" width="24" height="24" rx="5" fill="url(#brick-blob)" stroke="${stroke}" stroke-width="1.2"/>
        <rect x="28" y="3" width="24" height="24" rx="5" fill="url(#brick-blob-b)" stroke="${stroke}" stroke-width="1.2"/>
        <ellipse cx="10" cy="9" rx="5" ry="2.5" fill="#fff8e8" opacity="0.4"/>
        <ellipse cx="36" cy="9" rx="5" ry="2.5" fill="#fff0f4" opacity="0.35"/>
      </symbol>
      <symbol id="studio-brick-2" viewBox="0 0 ${BRICK_W} ${BRICK_H}">
        <rect width="${BRICK_W}" height="${BRICK_H}" fill="url(#brick-grout)"/>
        <rect x="3" y="2" width="48" height="12" rx="4" fill="url(#brick-blob)" stroke="${stroke}" stroke-width="1.1"/>
        <rect x="3" y="16" width="30" height="12" rx="4" fill="url(#brick-blob-b)" stroke="${stroke}" stroke-width="1.1"/>
        <rect x="35" y="16" width="16" height="12" rx="4" fill="url(#brick-blob-c)" stroke="${stroke}" stroke-width="1.1"/>
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
    .map(({ pts, patch, bright }, i) => {
      const fill = bright ? 'url(#wall-stone)' : 'url(#wall-stone-dim)';
      const swirl = i % 3 === 0 ? 'url(#wall-swirl-peach)' : i % 3 === 1 ? 'url(#wall-swirl-mint)' : 'url(#wall-swirl-cream)';
      return `<polygon points="${polyAttr(pts)}" fill="${fill}" stroke="#5a9aaa" stroke-width="0.85"/>
        <polygon points="${polyAttr(patch)}" fill="${swirl}" opacity="${bright ? 0.55 : 0.35}"/>`;
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
            stroke="#3a6878" stroke-width="1.2"/>
      <line x1="0" y1="0" x2="0" y2="${WALL_H}"
            stroke="#8ec8d0" stroke-width="1"/>
    </g>`;
}

/** Soft marble swirls across the full-width back wall (festive studio set). */
function backSwirlsMarkup(): string {
  return `<g id="studio-swirls" opacity="0.55" pointer-events="none">
      <path fill="url(#swirl-peach)" d="M-20 40 C80 10, 160 70, 260 35 S420 0, 520 45 S700 20, 680 80
        L680 120 C560 90, 440 130, 320 100 S120 140, -20 110 Z"/>
      <path fill="url(#swirl-cream)" d="M-10 70 C100 100, 200 50, 320 85 S480 40, 600 75 S700 110, 660 130
        L640 150 C500 120, 360 160, 220 130 S60 170, -10 140 Z"/>
      <path fill="url(#swirl-mint)" d="M40 20 C140 50, 220 5, 340 40 S500 10, 620 50
        L640 70 C500 30, 360 80, 220 45 S80 90, 40 55 Z"/>
      <path fill="url(#swirl-rose)" d="M-30 90 C90 60, 180 110, 300 75 S460 120, 580 85 S720 140, 700 160
        L660 175 C520 140, 380 180, 240 150 S50 190, -30 160 Z"/>
      <ellipse cx="120" cy="55" rx="48" ry="22" fill="url(#swirl-cream)" opacity="0.7"/>
      <ellipse cx="380" cy="70" rx="60" ry="26" fill="url(#swirl-peach)" opacity="0.55"/>
      <ellipse cx="540" cy="48" rx="42" ry="18" fill="url(#swirl-mint)" opacity="0.65"/>
    </g>`;
}

function bandsMarkup(): string {
  return `<g id="studio-bands">
      <rect x="0" y="0" width="${SCREEN_W}" height="10" fill="url(#band-top)"/>
      <rect x="0" y="10" width="${SCREEN_W}" height="3" fill="#f0d090"/>
      <rect x="0" y="13" width="${SCREEN_W}" height="95" fill="url(#band-wall)"/>
      ${backSwirlsMarkup()}
      <rect x="0" y="108" width="${SCREEN_W}" height="3" fill="#f0d090"/>
    </g>`;
}

function wallDefsMarkup(): string {
  return `<linearGradient id="wall-stone" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#b8e8e4"/>
        <stop offset="40%" stop-color="#7ec8c4"/>
        <stop offset="100%" stop-color="#4a9aaa"/>
      </linearGradient>
      <linearGradient id="wall-stone-dim" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#9ad4d0"/>
        <stop offset="50%" stop-color="#5ab0b0"/>
        <stop offset="100%" stop-color="#3a8088"/>
      </linearGradient>
      <linearGradient id="wall-face" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#8ed4d0"/>
        <stop offset="55%" stop-color="#5ab0b8"/>
        <stop offset="100%" stop-color="#3a8890"/>
      </linearGradient>
      <linearGradient id="wall-grout" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4a8890"/>
        <stop offset="100%" stop-color="#2a6068"/>
      </linearGradient>
      <linearGradient id="wall-jamb" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#4a8890"/>
        <stop offset="100%" stop-color="#2a5058"/>
      </linearGradient>
      <linearGradient id="wall-top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff0c8" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#5ab0b0"/>
      </linearGradient>
      <radialGradient id="wall-swirl-peach" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffe0b8"/>
        <stop offset="100%" stop-color="#f0a878" stop-opacity="0.2"/>
      </radialGradient>
      <radialGradient id="wall-swirl-mint" cx="40%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#d8fff0"/>
        <stop offset="100%" stop-color="#78d0b8" stop-opacity="0.15"/>
      </radialGradient>
      <radialGradient id="wall-swirl-cream" cx="45%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#fff8e0"/>
        <stop offset="100%" stop-color="#e8d090" stop-opacity="0.2"/>
      </radialGradient>
      <linearGradient id="band-top" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#5ec0c8"/>
        <stop offset="50%" stop-color="#7ed8d0"/>
        <stop offset="100%" stop-color="#5eb8d0"/>
      </linearGradient>
      <linearGradient id="band-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6a9ee0"/>
        <stop offset="55%" stop-color="#5a8ad4"/>
        <stop offset="100%" stop-color="#4a72c0"/>
      </linearGradient>
      <radialGradient id="swirl-peach" cx="40%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#ffd4a8"/>
        <stop offset="100%" stop-color="#ffd4a8" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="swirl-cream" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="#fff4d0"/>
        <stop offset="100%" stop-color="#fff4d0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="swirl-mint" cx="45%" cy="40%" r="55%">
        <stop offset="0%" stop-color="#b8f0e0"/>
        <stop offset="100%" stop-color="#b8f0e0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="swirl-rose" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#f8c0d0"/>
        <stop offset="100%" stop-color="#f8c0d0" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="brick-grout" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4a78c0"/>
        <stop offset="100%" stop-color="#3a62a8"/>
      </linearGradient>
      <linearGradient id="brick-blob" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stop-color="#ffe0c0"/>
        <stop offset="40%" stop-color="#f0b090"/>
        <stop offset="100%" stop-color="#d88878"/>
      </linearGradient>
      <linearGradient id="brick-blob-b" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stop-color="#f0c8e0"/>
        <stop offset="50%" stop-color="#d898c0"/>
        <stop offset="100%" stop-color="#b070a8"/>
      </linearGradient>
      <linearGradient id="brick-blob-c" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffe8a0"/>
        <stop offset="100%" stop-color="#e0b060"/>
      </linearGradient>`;
}

/** Permanent 640×350 underlay: light gray “floor” with horizontal board lines. */
export function buildStageBackdropSvg(): string {
  const base = '#d8d8d8';
  const line = '#b8b8b8';
  const step = 8;
  const lines: string[] = [];
  for (let y = step; y < VISIBLE_H; y += step) {
    lines.push(`<line x1="0" y1="${y}" x2="${SCREEN_W}" y2="${y}" stroke="${line}" stroke-width="1"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCREEN_W} ${VISIBLE_H}"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect width="${SCREEN_W}" height="${VISIBLE_H}" fill="${base}"/>
      <g id="stage-floor-lines" stroke-linecap="square">${lines.join('')}</g>
    </svg>`;
}

export function mountStageBackdrop(host: HTMLElement): void {
  host.innerHTML = buildStageBackdropSvg();
}

export function buildStudioSvg(kinds: readonly number[] = restoredBrickKinds()): string {
  const back = backWallRect();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="studio-lamp-glow" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stop-color="#fff8c0"/>
          <stop offset="40%" stop-color="#b8f070"/>
          <stop offset="100%" stop-color="#48a838"/>
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
        <g id="studio-lamps">${LAMP_POS.map((p) => lampMarkup(p.x, p.y)).join('')}</g>
      </g>
    </svg>`;
}

/** Side walls only — mounted above the assistant so she walks behind them. */
export function buildWallsSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>${wallDefsMarkup()}</defs>
      <g id="studio-walls-root" display="none">
        ${wallMarkup('left')}
        ${wallMarkup('right')}
      </g>
    </svg>`;
}

/**
 * Diffuse lamp spill over walls + floor (blend overlay).
 * Approximates soft tracing: radial fill from each bulb + flattened floor pools
 * (floor faces the lamps → wider ellipse), plus a bounce strip along the stage.
 */
export function buildStudioLightSvg(): string {
  const bulbs = lampBulbs();
  const defs = bulbs
    .map((b, i) => {
      const id = `lamp-fill-${i}`;
      const floorId = `lamp-floor-${i}`;
      return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse"
          cx="${b.x}" cy="${b.y}" r="220">
          <stop offset="0%" stop-color="#fff8d0" stop-opacity="0.55"/>
          <stop offset="22%" stop-color="#ffe8a0" stop-opacity="0.28"/>
          <stop offset="48%" stop-color="#ffd080" stop-opacity="0.1"/>
          <stop offset="100%" stop-color="#ffc060" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="${floorId}" gradientUnits="userSpaceOnUse"
          cx="${b.x}" cy="150" fx="${b.x}" fy="128" r="200">
          <stop offset="0%" stop-color="#fff4c8" stop-opacity="0.42"/>
          <stop offset="35%" stop-color="#ffe0a0" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#ffd080" stop-opacity="0"/>
        </radialGradient>`;
    })
    .join('');
  const fills = bulbs
    .map((b, i) => {
      // Floor pool: light hits the stage (y≥111); stretch sideways for diffuse bounce.
      const floorCy = 148;
      const floorRx = 170;
      const floorRy = 70;
      return `<circle class="lamp-fill" data-lamp="${i}" cx="${b.x}" cy="${b.y}" r="220"
            fill="url(#lamp-fill-${i})"/>
        <ellipse class="lamp-floor" data-lamp="${i}" cx="${b.x}" cy="${floorCy}"
            rx="${floorRx}" ry="${floorRy}" fill="url(#lamp-floor-${i})"/>`;
    })
    .join('');
  // Soft bounce along the wall–floor seam (indirect light).
  const bounce = `<rect x="0" y="105" width="${SCREEN_W}" height="48" fill="url(#lamp-bounce)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        ${defs}
        <linearGradient id="lamp-bounce" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fff0c0" stop-opacity="0.2"/>
          <stop offset="55%" stop-color="#ffe8a8" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#ffe8a8" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <g id="studio-light-root" display="none">
        ${fills}
        ${bounce}
      </g>
    </svg>`;
}

export function mountSvgStudio(
  host: HTMLElement,
  lightHost?: HTMLElement,
  wallsHost?: HTMLElement,
): StudioView {
  host.innerHTML = buildStudioSvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#studio-root');
  const bricks = host.querySelector<SVGGElement>('#studio-bricks');
  if (!root || !bricks) {
    throw new Error('SVG studio mount failed');
  }

  let lightRoot: SVGGElement | null = null;
  if (lightHost) {
    lightHost.innerHTML = buildStudioLightSvg();
    lightHost.hidden = true;
    lightRoot = lightHost.querySelector<SVGGElement>('#studio-light-root');
    if (!lightRoot) {
      throw new Error('SVG studio light mount failed');
    }
  }

  let wallsRoot: SVGGElement | null = null;
  if (wallsHost) {
    wallsHost.innerHTML = buildWallsSvg();
    wallsHost.hidden = true;
    wallsRoot = wallsHost.querySelector<SVGGElement>('#studio-walls-root');
    if (!wallsRoot) {
      throw new Error('SVG studio walls mount failed');
    }
  }

  return {
    setVisible(visible: boolean): void {
      if (visible) {
        root.setAttribute('display', 'inline');
      } else {
        root.setAttribute('display', 'none');
      }
      host.hidden = !visible;
      if (lightHost && lightRoot) {
        lightRoot.setAttribute('display', visible ? 'inline' : 'none');
        lightHost.hidden = !visible;
      }
      if (wallsHost && wallsRoot) {
        wallsRoot.setAttribute('display', visible ? 'inline' : 'none');
        wallsHost.hidden = !visible;
      }
    },
    setBricks(kinds: readonly number[]): void {
      bricks.innerHTML = brickUsesMarkup(kinds);
    },
  };
}
