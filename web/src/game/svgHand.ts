/**
 * SVG pointing hand for letter pick (alphabet row + board / plus sector).
 * Replaces the DOS HAND sprite blit so the finger stays visible over SVG overlays.
 *
 * Cursor art: Wikimedia Commons Mouse-cursor-hand-pointer.svg (right hand icon),
 * rotated 180° so the index finger points down.
 * https://commons.wikimedia.org/wiki/File:Mouse-cursor-hand-pointer.svg
 */
import { SCREEN_W } from '../engine/types';
import { setSvgShown } from './svgAssist';

export interface HandView {
  sync(active: boolean, ofs: number): void;
  setVisible(visible: boolean): void;
}

/** On-screen size of the downward hand cursor. */
export const HAND_W = 14;
export const HAND_H = 24;

export function handXY(ofs: number): { x: number; y: number } {
  return { x: ofs % SCREEN_W, y: Math.floor(ofs / SCREEN_W) };
}

/** Cropped hand icon from the Wikimedia cursor sheet, finger down after rotate(180). */
export const HAND_VIEWBOX = '19 0 13 24';

const HAND_POINTER_PATHS = `<g transform="rotate(180 25.5 12)">
  <path d="M19 1h2v1h1v4h2v1h3v1h2v1h1v1h1v7h-1v3h-1v3H19v-3h-1v-2h-1v-2h-1v-2h-1v-1h-1v-3h3v1h1V2h1"/>
  <g fill="#fff">
    <path d="M21 2v9h1V7h2v4h1V8h2v4h1V9h1v1h1v7h-1v3h-1v2h-8v-2h-1v-2h-1v-2h-1v-2h-1v-1h-1v-2h2v1h1v1h1V2"/>
  </g>
</g>`;

function buildHandSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g id="hand-cursor" display="none">
        <g id="hand-sprite" transform="translate(0 0)">
          <svg x="0" y="0" width="${HAND_W}" height="${HAND_H}" viewBox="${HAND_VIEWBOX}">
            ${HAND_POINTER_PATHS}
          </svg>
        </g>
      </g>
    </svg>`;
}

export function mountSvgHand(host: HTMLElement): HandView {
  host.innerHTML = buildHandSvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#hand-cursor');
  const sprite = host.querySelector<SVGGElement>('#hand-sprite');
  if (!root || !sprite) {
    throw new Error('SVG hand mount failed');
  }

  return {
    sync(active: boolean, ofs: number): void {
      if (!active) {
        setSvgShown(root, false);
        host.hidden = true;
        return;
      }
      const { x, y } = handXY(ofs);
      sprite.setAttribute('transform', `translate(${x} ${y})`);
      setSvgShown(root, true);
      host.hidden = false;
    },
    setVisible(visible: boolean): void {
      if (!visible) {
        setSvgShown(root, false);
        host.hidden = true;
      }
    },
  };
}
