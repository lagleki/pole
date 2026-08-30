/**
 * SVG commercial-break plaque (DIFF #19). Original ADWARE_BACKGROUND + the
 * DOS copy text, risen over Yakubovich instead of a framebuffer blit under
 * the host overlay.
 */
import type { PaletteColor } from '../spec/types';
import { SCREEN_W } from '../engine/types';
import { defaultAssetSpec, defaultRenderSpec } from '../spec';
import { indexedSpriteToSvg, setSvgShown } from './svgAssist';
import { escapeSvgText } from './svgHud';

export interface AdwareView {
  loadSprites(
    sprites: readonly { width: number; height: number; pixels: Uint8Array }[],
    palette: readonly PaletteColor[],
  ): void;
  setVisible(visible: boolean): void;
  /** DOS loop index: 79 = 2 px at the bottom, 0 = full plaque. */
  setRise(i: number): void;
}

const SPRITE = defaultAssetSpec.spriteIds;
/** drawSprite(..., 16): no palette index is transparent. */
const ADWARE_TC = 16;

/** dpr:1521-1554 — screenCopy 168×(160−2i) from BACKBUF+0x1b258 to 0x33d58. */
export const ADWARE_COPY_W = 168;
export const ADWARE_MAX_H = 160;
export const ADWARE_I0 = 79;
export const ADWARE_DST_OFS = 0x33d58;
export const ADWARE_SRC_OFS = 0x1b258;
export const ADWARE_SPRITE_OFS = 0x1b261;

export const ADWARE_DST_X = ADWARE_DST_OFS % SCREEN_W;
export const ADWARE_DST_Y0 = Math.floor(ADWARE_DST_OFS / SCREEN_W);
export const ADWARE_SRC_X = ADWARE_SRC_OFS % SCREEN_W;
export const ADWARE_SRC_Y = Math.floor(ADWARE_SRC_OFS / SCREEN_W);
export const ADWARE_SPRITE_DX = (ADWARE_SPRITE_OFS % SCREEN_W) - ADWARE_SRC_X;
export const ADWARE_SPRITE_DY = Math.floor(ADWARE_SPRITE_OFS / SCREEN_W) - ADWARE_SRC_Y;

/** Yellow print color 14 (dpr:1526-1535). */
const TEXT_FILL = egaHex(defaultRenderSpec.palette[14]!);

export const ADWARE_LINES: readonly { text: string; ofs: number }[] = [
  { text: 'Компьютерная игра', ofs: 0x1b4e9 },
  { text: 'продается по адресу', ofs: 0x26de1 },
  { text: '101000-Ц, МОСКВА,', ofs: 0x281e9 },
  { text: 'проезд Серова, 11.', ofs: 0x295e5 },
  { text: '25 самых первых', ofs: 0x2a9f1 },
  { text: 'покупателей будут', ofs: 0x2bde9 },
  { text: 'приглашены со', ofs: 0x2d1f9 },
  { text: 'своими семьями', ofs: 0x2e5f5 },
  { text: 'на съемки телеигры', ofs: 0x2f9e5 },
  { text: 'ПОЛЕ ЧУДЕС!', ofs: 0x31301 },
];

function egaHex(color: PaletteColor): string {
  return `#${color[0].toString(16).padStart(2, '0')}${color[1].toString(16).padStart(2, '0')}${color[2].toString(16).padStart(2, '0')}`;
}

export function adwareLineXY(ofs: number): { x: number; y: number } {
  return { x: (ofs % SCREEN_W) - ADWARE_SRC_X, y: Math.floor(ofs / SCREEN_W) - ADWARE_SRC_Y };
}

export function adwareRiseY(i: number): number {
  return ADWARE_DST_Y0 - 2 * (ADWARE_I0 - i);
}

export function adwareRiseH(i: number): number {
  return ADWARE_MAX_H - 2 * i;
}

function adwareTextMarkup(): string {
  return ADWARE_LINES.map(({ text, ofs }) => {
    const { x, y } = adwareLineXY(ofs);
    const n = [...text].length;
    return `<text x="${x}" y="${y + 7}" textLength="${8 * n}" lengthAdjust="spacingAndGlyphs">${escapeSvgText(text)}</text>`;
  }).join('');
}

export function buildAdwareSvg(): string {
  const y0 = adwareRiseY(ADWARE_I0);
  const h0 = adwareRiseH(ADWARE_I0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <clipPath id="adware-clip" clipPathUnits="userSpaceOnUse">
          <rect id="adware-clip-rect" x="${ADWARE_DST_X}" y="${y0}" width="${ADWARE_COPY_W}" height="${h0}"/>
        </clipPath>
      </defs>
      <g id="adware-root" display="none" clip-path="url(#adware-clip)"
         font-family="PT Mono, ui-monospace, monospace" font-size="8" fill="${TEXT_FILL}">
        <g id="adware-card" transform="translate(${ADWARE_DST_X} ${y0})">
          <g id="adware-sprite" transform="translate(${ADWARE_SPRITE_DX} ${ADWARE_SPRITE_DY})"></g>
          ${adwareTextMarkup()}
        </g>
      </g>
    </svg>`;
}

export function mountSvgAdware(host: HTMLElement): AdwareView {
  host.innerHTML = buildAdwareSvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#adware-root');
  const card = host.querySelector<SVGGElement>('#adware-card');
  const sprite = host.querySelector<SVGGElement>('#adware-sprite');
  const clipRect = host.querySelector<SVGRectElement>('#adware-clip-rect');
  if (!root || !card || !sprite || !clipRect) {
    throw new Error('SVG adware mount failed');
  }

  return {
    loadSprites(sprites, palette): void {
      const plaque = sprites[SPRITE.ADWARE_BACKGROUND];
      if (!plaque) {
        return;
      }
      sprite.innerHTML = indexedSpriteToSvg(
        plaque.pixels,
        plaque.width,
        plaque.height,
        ADWARE_TC,
        palette,
      );
    },
    setVisible(visible): void {
      setSvgShown(root, visible);
      host.hidden = !visible;
    },
    setRise(i): void {
      const y = adwareRiseY(i);
      const h = adwareRiseH(i);
      clipRect.setAttribute('y', String(y));
      clipRect.setAttribute('height', String(h));
      card.setAttribute('transform', `translate(${ADWARE_DST_X} ${y})`);
      this.setVisible(true);
    },
  };
}
