/**
 * SVG assistant overlay (DIFF #19). Original ASSIST_* sprites as run-length
 * SVG rects with index-2 transparency, so she walks over the board hole
 * without a canvas keep-blit.
 */
import type { PaletteColor } from '../spec/types';
import { SCREEN_W } from '../engine/types';
import { defaultAssetSpec } from '../spec';

export interface AssistView {
  loadSprites(
    sprites: readonly { width: number; height: number; pixels: Uint8Array }[],
    palette: readonly PaletteColor[],
  ): void;
  sync(active: boolean, ofs: number, spriteId: number): void;
  setVisible(visible: boolean): void;
}

export const ASSIST_TRANSPARENT = 2;
const SPRITE = defaultAssetSpec.spriteIds;
const ASSIST_IDS = [SPRITE.ASSIST_STAY, SPRITE.ASSIST_MOVE1, SPRITE.ASSIST_MOVE2, SPRITE.ASSIST_MOVE3] as const;

export function assistXY(ofs: number): { x: number; y: number } {
  return { x: ofs % SCREEN_W, y: Math.floor(ofs / SCREEN_W) };
}

function egaHex(color: PaletteColor): string {
  return `#${color[0].toString(16).padStart(2, '0')}${color[1].toString(16).padStart(2, '0')}${color[2].toString(16).padStart(2, '0')}`;
}

/** Run-length rects; transparent index is omitted. */
export function indexedSpriteToSvg(
  pixels: Uint8Array,
  width: number,
  height: number,
  transparent: number,
  palette: readonly PaletteColor[],
): string {
  const rects: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      const value = pixels[y * width + x];
      if (value === transparent) {
        x += 1;
        continue;
      }
      let x1 = x + 1;
      while (x1 < width && pixels[y * width + x1] === value) {
        x1 += 1;
      }
      const color = palette[value & 0x0f];
      if (color) {
        rects.push(
          `<rect x="${x}" y="${y}" width="${x1 - x}" height="1" fill="${egaHex(color)}"/>`,
        );
      }
      x = x1;
    }
  }
  return rects.join('');
}

function buildAssistSvg(): string {
  const frames = ASSIST_IDS.map(
    (id) => `<g class="assist-frame" data-sprite="${id}" hidden></g>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g id="assist-sprite" hidden>${frames}</g>
    </svg>`;
}

export function mountSvgAssist(host: HTMLElement): AssistView {
  host.innerHTML = buildAssistSvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#assist-sprite');
  if (!root) {
    throw new Error('SVG assistant mount failed');
  }
  const frames = [...host.querySelectorAll<SVGGElement>('.assist-frame')];

  return {
    loadSprites(sprites, palette): void {
      for (const frame of frames) {
        const id = Number(frame.getAttribute('data-sprite'));
        const sprite = sprites[id];
        if (!sprite) {
          continue;
        }
        frame.innerHTML = indexedSpriteToSvg(
          sprite.pixels,
          sprite.width,
          sprite.height,
          ASSIST_TRANSPARENT,
          palette,
        );
      }
    },
    sync(active, ofs, spriteId): void {
      if (!active) {
        root.setAttribute('hidden', '');
        host.hidden = true;
        return;
      }
      const { x, y } = assistXY(ofs);
      root.setAttribute('transform', `translate(${x} ${y})`);
      root.removeAttribute('hidden');
      host.hidden = false;
      for (const frame of frames) {
        const id = Number(frame.getAttribute('data-sprite'));
        if (id === spriteId) {
          frame.removeAttribute('hidden');
        } else {
          frame.setAttribute('hidden', '');
        }
      }
    },
    setVisible(visible: boolean): void {
      if (!visible) {
        root.setAttribute('hidden', '');
        host.hidden = true;
      }
    },
  };
}
