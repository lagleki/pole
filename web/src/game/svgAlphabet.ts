/**
 * SVG alphabet strip (DIFF #19). Same 32×(20×18) cells as the DOS LETTER_BACK
 * row at y = 0x14c, drawn as studio tiles so the drum can tuck under them.
 */
import { ALPHABET_LEN } from './constants';

export interface AlphabetView {
  setAvailable(available: Uint8Array): void;
  setVisible(visible: boolean): void;
  setVanishFrame(letterIdx: number, frame: number): void;
}

/** dpr: letter backs at 332, glyphs printed at 334 with span 20. */
export const ALPHA_Y = 0x14c;
export const ALPHA_TILE_W = 20;
export const ALPHA_TILE_H = 18;

const LETTERS = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';

function tileMarkup(i: number, ch: string): string {
  const x = i * ALPHA_TILE_W;
  return `<g class="alpha-tile" data-idx="${i}" transform="translate(${x} ${ALPHA_Y})">
      <g class="alpha-lift">
        <rect class="alpha-face" x="0.5" y="0.5" width="19" height="17" rx="1.2"
              fill="url(#alpha-face)" stroke="#6a7382" stroke-width="0.6"/>
        <path class="alpha-hi" fill="url(#alpha-hi)"
              d="M1 16.5 H18.5 V1.2 Q18.5 0.5 17.7 0.5 H1.3 Q0.5 0.5 0.5 1.3 V15.5 Z"/>
        <text x="10" y="9" dominant-baseline="central">${ch}</text>
      </g>
    </g>`;
}

export function buildAlphabetSvg(): string {
  const tiles = Array.from({ length: ALPHABET_LEN }, (_, i) => tileMarkup(i, LETTERS[i] ?? ''));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="alpha-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2a3144"/>
          <stop offset="55%" stop-color="#151a28"/>
          <stop offset="100%" stop-color="#0a0c14"/>
        </linearGradient>
        <linearGradient id="alpha-hi" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.2"/>
          <stop offset="40%" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <g id="alpha-row" font-family="PT Mono, ui-monospace, monospace" font-weight="700"
         font-size="13" fill="#ffffff" text-anchor="middle">
        ${tiles.join('')}
      </g>
    </svg>`;
}

export function mountSvgAlphabet(host: HTMLElement): AlphabetView {
  host.innerHTML = buildAlphabetSvg();
  host.hidden = true;
  const tiles = [...host.querySelectorAll<SVGGElement>('.alpha-tile')];

  const apply = (available: Uint8Array): void => {
    for (let i = 0; i < tiles.length; i += 1) {
      const used = i >= available.length || available[i] === 0x20;
      tiles[i]?.classList.toggle('used', used);
      tiles[i]?.classList.remove('vanish-1', 'vanish-2', 'vanish-3');
    }
  };

  return {
    setAvailable: apply,
    setVisible(visible: boolean): void {
      host.hidden = !visible;
    },
    setVanishFrame(letterIdx: number, frame: number): void {
      const tile = tiles[letterIdx];
      if (!tile) {
        return;
      }
      tile.classList.remove('vanish-1', 'vanish-2', 'vanish-3', 'used');
      if (frame <= 0) {
        return;
      }
      if (frame >= 3) {
        tile.classList.add('used');
        return;
      }
      tile.classList.add(`vanish-${frame}`);
    },
  };
}
