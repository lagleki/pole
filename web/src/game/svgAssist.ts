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
  /** faceLeft mirrors the sprite horizontally (walk toward the left). */
  sync(active: boolean, ofs: number, spriteId: number, faceLeft?: boolean): void;
  setVisible(visible: boolean): void;
}

/** Palette index treated as transparent in ASSIST_* sprites. */
export const ASSIST_TRANSPARENT = 2;
/** EGA nibble mask when reading indexed sprite pixels. */
const EGA_INDEX_MASK = 0x0f;

const SPRITE = defaultAssetSpec.spriteIds;
const ASSIST_IDS = [
  SPRITE.ASSIST_STAY,
  SPRITE.ASSIST_MOVE1,
  SPRITE.ASSIST_MOVE2,
  SPRITE.ASSIST_MOVE3,
] as const;

export function assistXY(ofs: number): { readonly x: number; readonly y: number } {
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
      const value = pixels[y * width + x]!;
      if (value === transparent) {
        x += 1;
        continue;
      }
      let x1 = x + 1;
      while (x1 < width && pixels[y * width + x1] === value) {
        x1 += 1;
      }
      const color = palette[value & EGA_INDEX_MASK];
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

/**
 * SVG ignores the HTML `hidden` attribute on `<g>`; use the display
 * presentation attribute so only one animation frame is visible.
 */
export function setSvgShown(el: Element, shown: boolean): void {
  el.setAttribute('display', shown ? 'inline' : 'none');
}

function buildAssistSvg(): string {
  const frames = ASSIST_IDS.map(
    (id) => `<g class="assist-frame" data-sprite="${id}" display="none"></g>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g id="assist-sprite" display="none">${frames}</g>
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
  const widths = new Map<number, number>();

  const hide = (): void => {
    setSvgShown(root, false);
    host.hidden = true;
  };

  return {
    loadSprites(sprites, palette): void {
      widths.clear();
      for (const frame of frames) {
        const id = Number(frame.getAttribute('data-sprite'));
        const sprite = sprites[id];
        if (!sprite) {
          continue;
        }
        widths.set(id, sprite.width);
        frame.innerHTML = indexedSpriteToSvg(
          sprite.pixels,
          sprite.width,
          sprite.height,
          ASSIST_TRANSPARENT,
          palette,
        );
      }
    },
    sync(active, ofs, spriteId, faceLeft = false): void {
      if (!active) {
        hide();
        return;
      }
      const { x, y } = assistXY(ofs);
      // Pivot on ASSIST_STAY width (25), not the current frame width — move frames
      // are 21..33px and a per-frame pivot makes leftward walks stutter.
      const pivotW = widths.get(SPRITE.ASSIST_STAY) ?? 25; // ASSIST_STAY_WIDTH
      root.setAttribute(
        'transform',
        faceLeft ? `translate(${x + pivotW} ${y}) scale(-1 1)` : `translate(${x} ${y})`,
      );
      setSvgShown(root, true);
      host.hidden = false;
      for (const frame of frames) {
        const id = Number(frame.getAttribute('data-sprite'));
        setSvgShown(frame, id === spriteId);
      }
    },
    setVisible(visible: boolean): void {
      if (!visible) {
        hide();
      }
    },
  };
}
