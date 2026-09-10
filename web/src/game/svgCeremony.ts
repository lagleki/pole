/**
 * SVG prize / endgame / top-8 ceremony (DIFF #19).
 * Presentation only — layout lives in ceremonyLayout.ts; flow passes line/row data.
 */
import type { PaletteColor } from '../spec/types';
import { defaultAssetSpec, defaultRenderSpec } from '../spec';
import {
  CEREMONY_LOGOS,
  TOP8_LAYOUT,
  top8RiseH,
  top8RiseY,
  top8RowY,
} from './ceremonyLayout';
import { indexedSpriteToSvg, setSvgShown } from './svgAssist';
import { escapeSvgText } from './svgHud';

export interface CeremonyLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  /** EGA palette index (default 14 = yellow). */
  readonly color?: number;
  /** When set, x is the center and the line is shifted by −(len≪2). */
  readonly center?: boolean;
}

export interface Top8Row {
  readonly rank: string;
  readonly score: string;
  readonly highlight: boolean;
}

export interface CeremonyView {
  loadSprites(
    sprites: readonly { width: number; height: number; pixels: Uint8Array }[],
    palette: readonly PaletteColor[],
  ): void;
  setVisible(visible: boolean): void;
  /** Full-screen gray stage with logos + body lines (prize / endgame). */
  showStage(lines: readonly CeremonyLine[]): void;
  clearRubs(): void;
  addRub(x: number, y: number): void;
  /** Compose the top-8 card; call setTop8Rise to reveal. */
  showTop8(rows: readonly Top8Row[]): void;
  /** Rise index: 79 = 2 px at the bottom, 0 = full plaque. */
  setTop8Rise(i: number): void;
}

// Re-exports so existing imports keep working during the layout split.
export {
  CEREMONY_LOGOS,
  ENDGAME_LAYOUT,
  PRIZE_LAYOUT,
  TOP8_LAYOUT,
  top8RiseH,
  top8RiseY,
  top8RowY,
} from './ceremonyLayout';
export const CEREMONY_LOGO_POLE = CEREMONY_LOGOS.pole;
export const CEREMONY_LOGO_CHUDES = CEREMONY_LOGOS.chudes;
export const TOP8_COPY_W = TOP8_LAYOUT.card.width;
export const TOP8_MAX_H = TOP8_LAYOUT.card.height;
export const TOP8_I0 = TOP8_LAYOUT.riseStartIndex;
export const TOP8_DST_X = TOP8_LAYOUT.card.x;
export const TOP8_DST_Y0 = TOP8_LAYOUT.card.y;

const SPRITE = defaultAssetSpec.spriteIds;
const LOGO_TC = 7;
const RUB_TC = 2;

const BG = egaHex(defaultRenderSpec.palette[7]!);
const TEXT_YELLOW = egaHex(defaultRenderSpec.palette[14]!);
const TEXT_GRAY = egaHex(defaultRenderSpec.palette[8]!);
const TEXT_WHITE = egaHex(defaultRenderSpec.palette[15]!);
const TEXT_SCORE = egaHex(defaultRenderSpec.palette[3]!);
const TEXT_SCORE_HI = egaHex(defaultRenderSpec.palette[5]!);
const CARD_BG = egaHex(defaultRenderSpec.palette[0]!);

function egaHex(color: PaletteColor): string {
  return `#${color[0].toString(16).padStart(2, '0')}${color[1].toString(16).padStart(2, '0')}${color[2].toString(16).padStart(2, '0')}`;
}

function monoText(text: string, x: number, y: number, fill: string, tracking = 0): string {
  const n = [...text].length;
  const cell = 8 + tracking;
  return `<text x="${x}" y="${y + 7}" fill="${fill}" textLength="${cell * Math.max(n, 1)}" lengthAdjust="spacingAndGlyphs">${escapeSvgText(text)}</text>`;
}

function lineMarkup(line: CeremonyLine): string {
  const n = [...line.text].length;
  const fill = egaHex(defaultRenderSpec.palette[(line.color ?? 14) & 0x0f]!);
  const x = line.center ? line.x - (n << 2) : line.x;
  return monoText(line.text, x, line.y, fill);
}

function shadowText(text: string, x: number, y: number, fill: string): string {
  return monoText(text, x + 1, y, TEXT_GRAY) + monoText(text, x, y, fill);
}

function top8TitleNodes(): string {
  return TOP8_LAYOUT.titles
    .map((title) => shadowText(title.text, title.x, title.y, TEXT_WHITE))
    .join('');
}

function top8RowNodes(rows: readonly Top8Row[]): string {
  const { rankX, scoreX } = TOP8_LAYOUT.row0;
  return Array.from({ length: TOP8_LAYOUT.rowCount }, (_, i) => {
    const row = rows[i] ?? { rank: `${i} `, score: '0$', highlight: false };
    const y = top8RowY(i);
    const scoreFill = row.highlight ? TEXT_SCORE_HI : TEXT_SCORE;
    return (
      shadowText(row.rank, rankX, y, TEXT_GRAY) +
      shadowText(row.score, scoreX, y, scoreFill)
    );
  }).join('');
}

function buildCeremonySvg(): string {
  const y0 = top8RiseY(TOP8_I0);
  const h0 = top8RiseH(TOP8_I0);
  const { card } = TOP8_LAYOUT;
  const pole = CEREMONY_LOGOS.pole;
  const chudes = CEREMONY_LOGOS.chudes;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <g id="ceremony-art-logo-pole"></g>
        <g id="ceremony-art-logo-chudes"></g>
        <g id="ceremony-art-rub"></g>
        <clipPath id="top8-clip" clipPathUnits="userSpaceOnUse">
          <rect id="top8-clip-rect" x="${card.x}" y="${y0}" width="${card.width}" height="${h0}"/>
        </clipPath>
      </defs>
      <g id="ceremony-root" display="none"
         font-family="PT Mono, ui-monospace, monospace" font-size="8">
        <g id="ceremony-stage" display="none">
          <rect id="ceremony-bg" x="0" y="0" width="640" height="350" fill="${BG}"/>
          <g id="ceremony-logo-pole" transform="translate(${pole.x} ${pole.y})">
            <use href="#ceremony-art-logo-pole"/>
          </g>
          <g id="ceremony-logo-chudes" transform="translate(${chudes.x} ${chudes.y})">
            <use href="#ceremony-art-logo-chudes"/>
          </g>
          <g id="ceremony-lines" fill="${TEXT_YELLOW}"></g>
          <g id="ceremony-rubs"></g>
        </g>
        <g id="top8-root" display="none" clip-path="url(#top8-clip)">
          <g id="top8-card" transform="translate(${card.x} ${y0})">
            <rect x="0" y="0" width="${card.width}" height="${card.height}" fill="${CARD_BG}"/>
            <g id="top8-lines"></g>
          </g>
        </g>
      </g>
    </svg>`;
}

export function buildCeremonySvgForTest(): string {
  return buildCeremonySvg();
}

export function mountSvgCeremony(host: HTMLElement): CeremonyView {
  host.innerHTML = buildCeremonySvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#ceremony-root');
  const stage = host.querySelector<SVGGElement>('#ceremony-stage');
  const lines = host.querySelector<SVGGElement>('#ceremony-lines');
  const rubs = host.querySelector<SVGGElement>('#ceremony-rubs');
  const logoPole = host.querySelector<SVGGElement>('#ceremony-art-logo-pole');
  const logoChudes = host.querySelector<SVGGElement>('#ceremony-art-logo-chudes');
  const rubArt = host.querySelector<SVGGElement>('#ceremony-art-rub');
  const top8Root = host.querySelector<SVGGElement>('#top8-root');
  const top8Card = host.querySelector<SVGGElement>('#top8-card');
  const top8Lines = host.querySelector<SVGGElement>('#top8-lines');
  const clipRect = host.querySelector<SVGRectElement>('#top8-clip-rect');
  if (
    !root || !stage || !lines || !rubs || !logoPole || !logoChudes || !rubArt ||
    !top8Root || !top8Card || !top8Lines || !clipRect
  ) {
    throw new Error('SVG ceremony mount failed');
  }

  const showRoot = (): void => {
    setSvgShown(root, true);
    host.hidden = false;
  };

  return {
    loadSprites(sprites, palette): void {
      const pole = sprites[SPRITE.LOGO_POLE];
      if (pole) {
        logoPole.innerHTML = indexedSpriteToSvg(
          pole.pixels, pole.width, pole.height, LOGO_TC, palette,
        );
      }
      const chudes = sprites[SPRITE.LOGO_CHUDES];
      if (chudes) {
        logoChudes.innerHTML = indexedSpriteToSvg(
          chudes.pixels, chudes.width, chudes.height, LOGO_TC, palette,
        );
      }
      const rub = sprites[SPRITE.RUB];
      if (rub) {
        rubArt.innerHTML = indexedSpriteToSvg(
          rub.pixels, rub.width, rub.height, RUB_TC, palette,
        );
      }
    },
    setVisible(visible): void {
      setSvgShown(root, visible);
      host.hidden = !visible;
      if (!visible) {
        setSvgShown(stage, false);
        setSvgShown(top8Root, false);
        rubs.innerHTML = '';
        lines.innerHTML = '';
        top8Lines.innerHTML = '';
      }
    },
    showStage(bodyLines): void {
      setSvgShown(top8Root, false);
      lines.innerHTML = bodyLines.map(lineMarkup).join('');
      rubs.innerHTML = '';
      setSvgShown(stage, true);
      showRoot();
    },
    clearRubs(): void {
      rubs.innerHTML = '';
    },
    addRub(x, y): void {
      rubs.insertAdjacentHTML(
        'beforeend',
        `<g transform="translate(${x} ${y})"><use href="#ceremony-art-rub"/></g>`,
      );
      setSvgShown(stage, true);
      showRoot();
    },
    showTop8(rows): void {
      setSvgShown(stage, false);
      rubs.innerHTML = '';
      lines.innerHTML = '';
      top8Lines.innerHTML = top8TitleNodes() + top8RowNodes(rows);
      this.setTop8Rise(TOP8_I0);
      showRoot();
    },
    setTop8Rise(i): void {
      const y = top8RiseY(i);
      const h = top8RiseH(i);
      clipRect.setAttribute('y', String(y));
      clipRect.setAttribute('height', String(h));
      top8Card.setAttribute('transform', `translate(${TOP8_LAYOUT.card.x} ${y})`);
      setSvgShown(top8Root, true);
      showRoot();
    },
  };
}
