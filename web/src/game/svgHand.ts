/**
 * SVG pointing hand for letter pick (alphabet row + board / plus sector).
 * Replaces the DOS HAND sprite blit so the finger stays visible over SVG overlays.
 */
import { SCREEN_W } from '../engine/types';

export interface HandView {
  sync(active: boolean, ofs: number): void;
  setVisible(visible: boolean): void;
}

export function handXY(ofs: number): { x: number; y: number } {
  return { x: ofs % SCREEN_W, y: Math.floor(ofs / SCREEN_W) };
}

function buildHandSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g id="hand-cursor" hidden>
        <g id="hand-sprite" transform="translate(0 0)">
          <path fill="#f4efe6" stroke="#2a2218" stroke-width="0.8"
                d="M2 18 L2 10 Q2 4 7 3 L9 2 Q12 1 13 4 L13 9 L14 3 Q15 0 17 1 L18 8 L19 4 Q20 1 22 3 L22 12
                   Q22 16 19 18 L14 22 Q11 25 8 25 L5 24 Q2 22 2 18 Z"/>
          <path fill="#dccfb8" stroke="none"
                d="M5 20 Q8 22 12 20 L15 17 Q17 15 17 12 L17 9 L15 12 Q13 14 11 13 L9 10 L8 14 Q7 16 5 17 Z"/>
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
        root.setAttribute('hidden', '');
        host.hidden = true;
        return;
      }
      const { x, y } = handXY(ofs);
      sprite.setAttribute('transform', `translate(${x} ${y})`);
      root.removeAttribute('hidden');
      host.hidden = false;
    },
    setVisible(visible: boolean): void {
      if (!visible) {
        root.setAttribute('hidden', '');
        host.hidden = true;
      }
    },
  };
}
