/**
 * SVG splash / intro screen (DIFF #19).
 * Presentation only — layout in splashLayout.ts; flow drives phases + audio/skip.
 */
import type { PaletteColor } from '../spec/types';
import { defaultAssetSpec, defaultRenderSpec } from '../spec';
import {
  SPLASH_CREDITS,
  SPLASH_HELP,
  SPLASH_HELP_BAND,
  SPLASH_LOGOS,
  SPLASH_STAGE,
  SPLASH_TIMING,
  SPLASH_TITLE,
  SPLASH_TITLE_LETTERS,
  splashHStripeColumns,
  splashVStripeRows,
  type SplashTextLine,
} from './splashLayout';
import { indexedSpriteToSvg, setSvgShown } from './svgAssist';
import { escapeSvgText } from './svgHud';

export interface SplashView {
  loadSprites(
    sprites: readonly { width: number; height: number; pixels: Uint8Array }[],
    palette: readonly PaletteColor[],
  ): void;
  setVisible(visible: boolean): void;
  /** Black stage, hide logos/title/credits — start of intro. */
  reset(): void;
  /** Diagonal gray wipe, frame 0 .. wipeFrames-1. */
  setWipeFrame(frame: number): void;
  /** V-line phase after the wipe, frame 0 .. vLineFrames-1. */
  setVLineFrame(frame: number): void;
  /** Append one H-stripe column (0-based). */
  addHStripeColumn(column: number): void;
  /** Append one V-stripe row (0-based). */
  addVStripeRow(row: number): void;
  showLogos(): void;
  /** Reveal the first `count` title glyphs (0 = none). */
  setTitleLetters(count: number): void;
  showCredits(): void;
}

export {
  SPLASH_TIMING,
  SPLASH_TITLE,
  SPLASH_TITLE_LETTERS,
  splashHStripeColumns,
  splashVStripeRows,
} from './splashLayout';

const SPRITE = defaultAssetSpec.spriteIds;
const LOGO_TC = 7;

const BLACK = egaHex(defaultRenderSpec.palette[0]!);
const GRAY = egaHex(defaultRenderSpec.palette[7]!);
const STRIPE = egaHex(defaultRenderSpec.palette[4]!);

function egaHex(color: PaletteColor): string {
  return `#${color[0].toString(16).padStart(2, '0')}${color[1].toString(16).padStart(2, '0')}${color[2].toString(16).padStart(2, '0')}`;
}

function paletteFill(index: number): string {
  return egaHex(defaultRenderSpec.palette[index & 0x0f]!);
}

function monoText(line: SplashTextLine): string {
  const n = [...line.text].length;
  const tracking = line.tracking ?? 0;
  const cell = 8 + tracking;
  return `<text x="${line.x}" y="${line.y + 7}" fill="${paletteFill(line.color)}" textLength="${cell * Math.max(n, 1)}" lengthAdjust="spacingAndGlyphs">${escapeSvgText(line.text)}</text>`;
}

function titleGlyphMarkup(ch: string, x: number, y: number): string {
  const outline = [
    [x - 1, y - 1],
    [x + 1, y - 1],
    [x - 1, y + 1],
    [x + 1, y + 1],
    [x - 1, y + 2],
    [x + 1, y + 2],
  ] as const;
  const shadow = outline
    .map(([px, py]) => monoText({ text: ch, x: px, y: py, color: 0 }))
    .join('');
  const face =
    monoText({ text: ch, x, y, color: 15 }) +
    monoText({ text: ch, x, y: y + 1, color: 15 });
  return `<g class="splash-title-glyph" display="none">${shadow}${face}</g>`;
}

function rectMarkup(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
}

function buildSplashSvg(): string {
  const { width, height } = SPLASH_STAGE;
  const titleNodes = [...SPLASH_TITLE].map((ch, i) => {
    const pos = SPLASH_TITLE_LETTERS[i]!;
    return titleGlyphMarkup(ch, pos.x, pos.y);
  }).join('');
  const pole = SPLASH_LOGOS.pole;
  const chudes = SPLASH_LOGOS.chudes;
  const band = SPLASH_HELP_BAND;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <g id="splash-art-logo-pole"></g>
        <g id="splash-art-logo-chudes"></g>
        <clipPath id="splash-wipe-clip" clipPathUnits="userSpaceOnUse">
          <polygon id="splash-wipe-poly" points="0,350 0,350 0,350"/>
        </clipPath>
      </defs>
      <g id="splash-root" display="none"
         font-family="PT Mono, ui-monospace, monospace" font-size="8">
        <rect id="splash-bg" x="0" y="0" width="${width}" height="${height}" fill="${BLACK}"/>
        <g id="splash-wipe" clip-path="url(#splash-wipe-clip)">
          <rect x="0" y="0" width="${width}" height="${height}" fill="${GRAY}"/>
        </g>
        <g id="splash-vlines" fill="none" stroke="${GRAY}" stroke-width="3"></g>
        <g id="splash-stripes"></g>
        <g id="splash-logos" display="none">
          <g transform="translate(${pole.x} ${pole.y})"><use href="#splash-art-logo-pole"/></g>
          <g transform="translate(${chudes.x} ${chudes.y})"><use href="#splash-art-logo-chudes"/></g>
        </g>
        <g id="splash-title">${titleNodes}</g>
        <g id="splash-credits" display="none">
          ${SPLASH_CREDITS.map(monoText).join('')}
          ${rectMarkup(band.x, band.y, band.width, band.height, BLACK)}
          ${SPLASH_HELP.map(monoText).join('')}
        </g>
      </g>
    </svg>`;
}

export function buildSplashSvgForTest(): string {
  return buildSplashSvg();
}

/** Diagonal wipe polygon for frame i (0 = empty, last = full stage). */
export function splashWipePolygon(frame: number): string {
  const max = Math.max(1, SPLASH_TIMING.wipeFrames - 1);
  const t = Math.max(0, Math.min(1, frame / max));
  const { width: w, height: h } = SPLASH_STAGE;
  if (t <= 0) {
    return `0,${h} 0,${h} 0,${h}`;
  }
  const cut = t * (w + h);
  if (cut <= h) {
    return `0,${h} ${cut},${h} 0,${h - cut}`;
  }
  const alongTop = cut - h;
  if (alongTop >= w) {
    return `0,0 ${w},0 ${w},${h} 0,${h}`;
  }
  return `0,${h} ${w},${h} ${w},0 ${alongTop},0 0,0`;
}

export function splashVLinePaths(frame: number): string {
  const max = SPLASH_TIMING.vLineFrames - 1;
  const i = Math.max(0, Math.min(max, frame));
  const leftX2 = 180 - i;
  const leftY2 = 185 - i;
  const rightX1 = 460 + i;
  const rightY1 = 185 - i;
  return (
    `<line x1="20" y1="345" x2="${leftX2}" y2="${leftY2}"/>` +
    `<line x1="${rightX1}" y1="${rightY1}" x2="620" y2="345"/>`
  );
}

export function mountSvgSplash(host: HTMLElement): SplashView {
  host.innerHTML = buildSplashSvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#splash-root');
  const wipePoly = host.querySelector<SVGPolygonElement>('#splash-wipe-poly');
  const vlines = host.querySelector<SVGGElement>('#splash-vlines');
  const stripes = host.querySelector<SVGGElement>('#splash-stripes');
  const logos = host.querySelector<SVGGElement>('#splash-logos');
  const credits = host.querySelector<SVGGElement>('#splash-credits');
  const logoPole = host.querySelector<SVGGElement>('#splash-art-logo-pole');
  const logoChudes = host.querySelector<SVGGElement>('#splash-art-logo-chudes');
  const titleGlyphs = [...host.querySelectorAll<SVGGElement>('.splash-title-glyph')];
  if (!root || !wipePoly || !vlines || !stripes || !logos || !credits || !logoPole || !logoChudes) {
    throw new Error('SVG splash mount failed');
  }

  const hCols = splashHStripeColumns();
  const vRows = splashVStripeRows();

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
    },
    setVisible(visible): void {
      setSvgShown(root, visible);
      host.hidden = !visible;
      if (!visible) {
        this.reset();
      }
    },
    reset(): void {
      wipePoly.setAttribute('points', splashWipePolygon(0));
      vlines.innerHTML = '';
      stripes.innerHTML = '';
      setSvgShown(logos, false);
      setSvgShown(credits, false);
      titleGlyphs.forEach((g) => setSvgShown(g, false));
      showRoot();
    },
    setWipeFrame(frame): void {
      wipePoly.setAttribute('points', splashWipePolygon(frame));
      showRoot();
    },
    setVLineFrame(frame): void {
      // Keep wipe fully open during the V-line beat.
      wipePoly.setAttribute('points', splashWipePolygon(SPLASH_TIMING.wipeFrames - 1));
      vlines.innerHTML = splashVLinePaths(frame);
      showRoot();
    },
    addHStripeColumn(column): void {
      const cells = hCols[column];
      if (!cells) {
        return;
      }
      stripes.insertAdjacentHTML(
        'beforeend',
        cells.map((c) => rectMarkup(c.x, c.y, c.w, c.h, STRIPE)).join(''),
      );
      showRoot();
    },
    addVStripeRow(row): void {
      const cells = vRows[row];
      if (!cells) {
        return;
      }
      stripes.insertAdjacentHTML(
        'beforeend',
        cells.map((c) => rectMarkup(c.x, c.y, c.w, c.h, STRIPE)).join(''),
      );
      showRoot();
    },
    showLogos(): void {
      setSvgShown(logos, true);
      showRoot();
    },
    setTitleLetters(count): void {
      titleGlyphs.forEach((g, i) => setSvgShown(g, i < count));
      showRoot();
    },
    showCredits(): void {
      setSvgShown(credits, true);
      showRoot();
    },
  };
}

