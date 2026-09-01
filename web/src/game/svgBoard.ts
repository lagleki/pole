/**
 * SVG game board — marble panel, raised bezel, stage banner, word tiles (DIFF #19 extension).
 * Live play stacks this above the rear canvas; punchOverlayHoles() remains for tests.
 */
import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { STAGE_NAMES, SUPERGAME_BANNER } from './constants';
import { escapeSvgText } from './svgHud';

/** EGA palette bytes used by the original board chrome. */
const EGA_BLACK = '#000000';

/** Raised frame around the grid (marble panel extends under this ring). */
export const BOARD_BEZEL = 4;

/** Word cards sit on the 16×20 board grid; styled like svgAlphabet tiles but taller. */
export const WORD_TILE_W = 16;
export const WORD_TILE_H = 20;
export const WORD_TILE_FONT = 14;
export const STAGE_TILE_FONT = 14;

export const GRID_COL_W = 16;
export const GRID_ROW_H = 20;
export const GRID_COLS = 25;
export const GRID_ROWS = 4;
export const WORD_ROW = 1;
/** Stage title row — dpr:803 print lands on grid row 3 (y ≈ 75–95). */
export const STAGE_ROW = 3;
export const BOARD_FRAME = { x: 120, y: 15, w: 400, h: 80 };

export const BOARD_OUTER = {
  x: BOARD_FRAME.x - BOARD_BEZEL,
  y: BOARD_FRAME.y - BOARD_BEZEL,
  w: BOARD_FRAME.w + BOARD_BEZEL * 2,
  h: BOARD_FRAME.h + BOARD_BEZEL * 2,
};

export interface BoardWordCell {
  letter: string;
  /** hidden tile, revealed letter, or word-entry typing */
  state: 'hidden' | 'open' | 'entry';
}

export interface BoardView {
  setVisible(visible: boolean): void;
  setStage(stage: number): void;
  setBanner(text: string): void;
  setWordBoard(wordPos: number, cells: readonly BoardWordCell[]): void;
}

/** Linear cell anchor (dpr:1091+, paintWordBoard). */
export function wordCellOfs(wordPos: number, index: number): number {
  return (index << 4) + wordPos + 11 * SCREEN_W;
}

export function wordPosForLength(len: number): number {
  return 0x19 * SCREEN_W + 121 + 12 * 16 - ((len >> 1) << 4);
}

/** Snap a DOS word-tile X to the board grid column (16 px). */
export function wordTileX(wordPos: number, index: number): number {
  const raw = wordCellOfs(wordPos, index) % SCREEN_W;
  const col = Math.floor((raw - BOARD_FRAME.x) / GRID_COL_W);
  return BOARD_FRAME.x + col * GRID_COL_W;
}

export function wordTileY(): number {
  return BOARD_FRAME.y + WORD_ROW * GRID_ROW_H;
}

export function stageTileX(index: number, len: number): number {
  const startCol = Math.floor((GRID_COLS - len) / 2);
  return BOARD_FRAME.x + (startCol + index) * GRID_COL_W;
}

export function stageTileY(): number {
  return BOARD_FRAME.y + STAGE_ROW * GRID_ROW_H;
}

export function buildStageRowMarkup(name: string): string {
  const chars = [...name];
  const len = chars.length;
  return chars
    .map((ch, i) => {
      const x = stageTileX(i, len);
      const y = stageTileY();
      const label = ch === ' ' ? '' : escapeSvgText(ch);
      return `<g class="stage-cell" data-idx="${i}" transform="translate(${x} ${y})">
      <text x="${GRID_COL_W / 2}" y="${GRID_ROW_H / 2 + 1}" dominant-baseline="central"
            text-anchor="middle">${label}</text>
    </g>`;
    })
    .join('');
}

/** Board panel + raised bezel — studio wallpaper is a separate SVG overlay. */
export function boardPunchRects(): readonly { x: number; y: number; w: number; h: number }[] {
  return [
    { x: BOARD_OUTER.x, y: BOARD_OUTER.y, w: BOARD_OUTER.w, h: BOARD_OUTER.h },
  ];
}

export function punchOverlayHoles(rgba: Uint8ClampedArray): void {
  for (const { x, y, w, h } of boardPunchRects()) {
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
}

function boardDefsMarkup(): string {
  return `<defs>
        <filter id="marble-grain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.07" numOctaves="3" seed="17" result="noise"/>
          <feColorMatrix in="noise" type="matrix"
            values="0 0 0 0 0.88
                    0 0 0 0 0.88
                    0 0 0 0 0.90
                    0 0 0 0.07 0" result="tint"/>
          <feBlend in="SourceGraphic" in2="tint" mode="multiply"/>
        </filter>
        <linearGradient id="marble-base" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f2f2f5"/>
          <stop offset="22%" stop-color="#dcdce2"/>
          <stop offset="48%" stop-color="#ececf0"/>
          <stop offset="71%" stop-color="#c8c8d0"/>
          <stop offset="100%" stop-color="#e4e4ea"/>
        </linearGradient>
        <linearGradient id="marble-veins" x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="35%" stop-color="#ffffff" stop-opacity="0.35"/>
          <stop offset="50%" stop-color="#9a9aa8" stop-opacity="0.18"/>
          <stop offset="68%" stop-color="#ffffff" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="word-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2a3144"/>
          <stop offset="55%" stop-color="#151a28"/>
          <stop offset="100%" stop-color="#0a0c14"/>
        </linearGradient>
        <linearGradient id="word-hi" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.2"/>
          <stop offset="40%" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
      </defs>`;
}

function marblePanelMarkup(): string {
  const { x, y, w, h } = BOARD_OUTER;
  return `<g id="board-panel">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5"
            fill="url(#marble-base)" filter="url(#marble-grain)"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5"
            fill="url(#marble-veins)" opacity="0.55"/>
    </g>`;
}

function bezelOuterMarkup(): string {
  const { x, y, w, h } = BOARD_OUTER;
  const inner = BOARD_BEZEL;
  return `<g id="board-bezel">
      <rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="2"
            fill="none" stroke="${EGA_BLACK}" stroke-width="${inner}"/>
      <rect x="${x + inner - 0.5}" y="${y + inner - 0.5}"
            width="${w - inner * 2 + 1}" height="${h - inner * 2 + 1}" rx="1"
            fill="none" stroke="#1a1a20" stroke-width="1"/>
    </g>`;
}

/** Gray inner lip over the grid — 1 px overlap at corners hides white anti-alias gaps. */
function bezelInnerLipMarkup(): string {
  const { x: ix, y: iy, w: iw, h: ih } = BOARD_FRAME;
  const pad = 1;
  const lip = 1;
  const gray = '#aaaaaa';
  return `<g id="board-bezel-lip">
      <rect x="${ix - pad}" y="${iy - pad}" width="${iw + pad * 2}" height="${lip}" fill="${gray}"/>
      <rect x="${ix - pad}" y="${iy + ih - lip + pad}" width="${iw + pad * 2}" height="${lip}" fill="${gray}"/>
      <rect x="${ix - pad}" y="${iy - pad}" width="${lip}" height="${ih + pad * 2}" fill="${gray}"/>
      <rect x="${ix + iw - lip + pad}" y="${iy - pad}" width="${lip}" height="${ih + pad * 2}" fill="${gray}"/>
    </g>`;
}

function tileDefsMarkup(): string {
  return boardDefsMarkup();
}

function gridMarkup(): string {
  const { x, y } = BOARD_FRAME;
  const cells: string[] = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const cx = x + col * GRID_COL_W;
      const cy = y + row * GRID_ROW_H;
      const tint = (row + col) % 2 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.04)';
      cells.push(
        `<rect x="${cx}" y="${cy}" width="${GRID_COL_W}" height="${GRID_ROW_H}" fill="${tint}" stroke="${EGA_BLACK}" stroke-width="0.75" opacity="0.95"/>`,
      );
    }
  }
  return `<g id="board-grid">${cells.join('')}</g>`;
}

/** Studio tile matching svgAlphabet, scaled to the board grid cell. */
function tileMarkup(wordPos: number, index: number): string {
  const x = wordTileX(wordPos, index);
  const y = wordTileY();
  const faceW = WORD_TILE_W - 1;
  const faceH = WORD_TILE_H - 1;
  const hiBottom = faceH - 0.5;
  const hiRight = faceW - 0.5;
  const hiRadius = faceW - 1.3;
  return `<g class="word-tile" data-idx="${index}" transform="translate(${x} ${y})">
      <g class="word-lift">
        <rect class="word-face" x="0.5" y="0.5" width="${faceW}" height="${faceH}" rx="1.2"
              fill="url(#word-face)" stroke="#6a7382" stroke-width="0.6"/>
        <path class="word-hi" fill="url(#word-hi)"
              d="M1 ${hiBottom} H${hiRight} V1.2 Q${hiRight} 0.5 ${hiRadius} 0.5 H1.3 Q0.5 0.5 0.5 1.3 V${faceH - 1.5} Z"/>
        <text class="word-letter" x="${WORD_TILE_W / 2}" y="${WORD_TILE_H / 2 + 0.5}"
              dominant-baseline="central" text-anchor="middle" visibility="hidden"></text>
      </g>
    </g>`;
}

export function buildBoardSvg(): string {
  const tiles = Array.from({ length: 20 }, (_, i) =>
    tileMarkup(wordPosForLength(10), i),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${tileDefsMarkup()}
      ${marblePanelMarkup()}
      ${bezelOuterMarkup()}
      ${gridMarkup()}
      ${bezelInnerLipMarkup()}
      <g id="stage-row" font-family="PT Mono, ui-monospace, monospace" font-weight="700"
         font-size="${STAGE_TILE_FONT}" fill="#1a1a22" text-anchor="middle"></g>
      <g id="word-row" font-family="PT Mono, ui-monospace, monospace" font-weight="700"
         font-size="${WORD_TILE_FONT}" fill="#ffffff" text-anchor="middle">${tiles.join('')}</g>
    </svg>`;
}

export function mountSvgBoard(host: HTMLElement): BoardView {
  host.innerHTML = buildBoardSvg();
  host.hidden = true;
  const stageRow = host.querySelector<SVGGElement>('#stage-row');
  const wordRow = host.querySelector<SVGGElement>('#word-row');
  if (!stageRow || !wordRow) {
    throw new Error('SVG board mount failed');
  }

  let wordPos = wordPosForLength(0);

  const relayoutTiles = (count: number): void => {
    wordRow.innerHTML = Array.from({ length: count }, (_, i) => tileMarkup(wordPos, i)).join('');
  };

  return {
    setVisible(visible: boolean): void {
      host.hidden = !visible;
    },
    setStage(stage: number): void {
      stageRow.innerHTML = buildStageRowMarkup(STAGE_NAMES[stage] ?? '');
    },
    setBanner(text: string): void {
      stageRow.innerHTML = buildStageRowMarkup(text || SUPERGAME_BANNER);
    },
    setWordBoard(pos: number, cells: readonly BoardWordCell[]): void {
      wordPos = pos;
      relayoutTiles(cells.length);
      const tiles = [...wordRow.querySelectorAll<SVGGElement>('.word-tile')];
      for (let i = 0; i < tiles.length; i += 1) {
        const tile = tiles[i];
        const cell = cells[i];
        const letterEl = tile?.querySelector<SVGTextElement>('.word-letter');
        const faceEl = tile?.querySelector<SVGRectElement>('.word-face');
        const hiEl = tile?.querySelector<SVGPathElement>('.word-hi');
        if (!tile || !cell || !letterEl || !faceEl) {
          continue;
        }
        const showLetter = cell.state === 'open' || cell.state === 'entry';
        letterEl.setAttribute('visibility', showLetter ? 'visible' : 'hidden');
        letterEl.textContent = showLetter ? cell.letter : '';
        if (cell.state === 'open') {
          // Revealed letter: no tile fill, black glyph on the marble.
          faceEl.setAttribute('fill', 'none');
          faceEl.setAttribute('stroke', 'none');
          hiEl?.setAttribute('display', 'none');
          letterEl.setAttribute('fill', '#000000');
        } else {
          faceEl.setAttribute('fill', 'url(#word-face)');
          faceEl.setAttribute('stroke', cell.state === 'entry' ? '#8a9ab8' : '#6a7382');
          hiEl?.setAttribute('display', 'inline');
          letterEl.setAttribute('fill', '#ffffff');
        }
      }
    },
  };
}
