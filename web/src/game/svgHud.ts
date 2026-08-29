/**
 * SVG seat plaques and speech bubbles (DIFF #19).
 * Plaques sit behind the drum; talk/choice clouds stay inside the sprite box
 * and the pair is vertically centered on the sprite.
 */
import { SCREEN_W } from '../engine/types';
import { liveSeat } from './constants';
import { svgWheelLayout } from './svgWheel';

export const PLATE_W = 108;
export const PLATE_H = 28;
export const BUBBLE_H = 34;
export const BUBBLE_GAP = 4;
const BUBBLE_PAD = 2;
const BUBBLE_MIN_W = 36;

export interface HudSeat {
  caption: string;
  name: string;
  present: boolean;
}

export interface SpriteBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudView {
  setVisible(visible: boolean): void;
  setSeats(seats: readonly HudSeat[], blink?: { seat: number; on: boolean }): void;
  showTalk(box: SpriteBox, text: string, side: 'west' | 'east'): void;
  showChoice(box: SpriteBox, left: string, right: string): void;
  hideBubbles(): void;
}

export function ofsXy(ofs: number): { x: number; y: number } {
  return { x: ofs % SCREEN_W, y: Math.floor(ofs / SCREEN_W) };
}

export function seatPlateRects(): readonly { x: number; y: number; w: number; h: number }[] {
  return [0, 1, 2].map((i) => {
    const { x, y } = ofsXy(liveSeat(i).labelOfs);
    return { x, y, w: PLATE_W, h: PLATE_H };
  });
}

export function escapeSvgText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function bubbleSize(box: SpriteBox, pair: boolean): { w: number; h: number } {
  const h = Math.min(BUBBLE_H, Math.max(22, box.h * 0.4));
  if (pair) {
    const w = Math.max(BUBBLE_MIN_W, (box.w - BUBBLE_GAP - BUBBLE_PAD * 2) / 2);
    return { w, h };
  }
  return { w: Math.max(BUBBLE_MIN_W, box.w * 0.62), h };
}

/** Choice pair stays inside the sprite rect; tails point inward. */
export function choiceBubbleLayout(box: SpriteBox): { leftX: number; rightX: number; y: number; w: number; h: number } {
  const { w, h } = bubbleSize(box, true);
  const y = box.y + box.h / 2 - h / 2;
  const leftX = box.x + BUBBLE_PAD;
  const rightX = box.x + box.w - BUBBLE_PAD - w;
  return { leftX, rightX, y, w, h };
}

export function talkBubbleLayout(
  box: SpriteBox,
  side: 'west' | 'east',
): { x: number; y: number; w: number; h: number } {
  const { w, h } = bubbleSize(box, false);
  const y = box.y + box.h / 2 - h / 2;
  const x = side === 'west' ? box.x + BUBBLE_PAD : box.x + box.w - BUBBLE_PAD - w;
  return { x, y, w, h };
}

function bubbleMarkup(x: number, y: number, w: number, h: number, text: string, tail: 'east' | 'west'): string {
  const tailW = 7;
  const bodyW = w - tailW;
  const bodyX = tail === 'west' ? tailW : 0;
  const mid = h / 2;
  const tailPts =
    tail === 'east'
      ? `${bodyW - 1},${mid - 5} ${w},${mid} ${bodyW - 1},${mid + 5}`
      : `${tailW + 1},${mid - 5} 0,${mid} ${tailW + 1},${mid + 5}`;
  const fontSize = w < 48 ? 8 : 10;
  return `<g class="hud-bubble" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <polygon points="${tailPts}" fill="#ffe566" stroke="#2a2030" stroke-width="0.8"/>
      <rect x="${bodyX}" y="0.5" width="${bodyW}" height="${h - 1}" rx="7"
            fill="#ffe566" stroke="#2a2030" stroke-width="0.8"/>
      <text x="${bodyX + bodyW / 2}" y="${mid}" dominant-baseline="central"
            text-anchor="middle" font-size="${fontSize}">${escapeSvgText(text)}</text>
    </g>`;
}

function plateMarkup(seatIdx: number): string {
  const { x, y } = ofsXy(liveSeat(seatIdx).labelOfs);
  return `<g class="hud-plate" data-seat="${seatIdx}" transform="translate(${x} ${y})">
      <rect width="${PLATE_W}" height="${PLATE_H}" rx="2.2" fill="url(#hud-plate)" stroke="#6a7382" stroke-width="0.7"/>
      <text class="hud-caption" x="${PLATE_W / 2}" y="8" dominant-baseline="central" text-anchor="middle"></text>
      <text class="hud-name" x="${PLATE_W / 2}" y="20" dominant-baseline="central" text-anchor="middle"></text>
    </g>`;
}

function svgShell(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${inner}
    </svg>`;
}

function plateClipPath(): string {
  const { x: cx, y: cy } = svgWheelLayout.center;
  const r = svgWheelLayout.holeR;
  return `M0,0h640v350h-640Z M${cx},${cy} m ${-r},0 a ${r},${r} 0 1,1 ${2 * r},0 a ${r},${r} 0 1,1 ${-2 * r},0`;
}
export function buildHudSvg(): string {
  return svgShell(`<defs>
        <clipPath id="plate-under-drum" clipPathUnits="userSpaceOnUse">
          <path clip-rule="evenodd" d="${plateClipPath()}"/>
        </clipPath>
        <linearGradient id="hud-plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3a4258"/>
          <stop offset="100%" stop-color="#12161f"/>
        </linearGradient>
      </defs>
      <g id="hud-plates" clip-path="url(#plate-under-drum)"
         font-family="PT Mono, ui-monospace, monospace" font-weight="700"
         font-size="9" fill="#ffffff">
        ${plateMarkup(0)}${plateMarkup(1)}${plateMarkup(2)}
      </g>`);
}

export function buildBubbleSvg(): string {
  return svgShell(`<g id="hud-bubbles" font-family="PT Mono, ui-monospace, monospace" font-weight="700"
         font-size="11" fill="#1a1520"></g>`);
}

export function mountSvgHud(plateHost: HTMLElement, bubbleHost: HTMLElement): HudView {
  plateHost.innerHTML = buildHudSvg();
  bubbleHost.innerHTML = buildBubbleSvg();
  plateHost.hidden = true;
  bubbleHost.hidden = true;
  const plates = [...plateHost.querySelectorAll<SVGGElement>('.hud-plate')];
  const bubbles = bubbleHost.querySelector<SVGGElement>('#hud-bubbles');
  if (!bubbles) {
    throw new Error('SVG HUD bubbles missing');
  }

  return {
    setVisible(visible: boolean): void {
      plateHost.hidden = !visible;
      bubbleHost.hidden = !visible;
    },
    setSeats(seats, blink): void {
      for (let i = 0; i < plates.length; i += 1) {
        const plate = plates[i];
        const seat = seats[i];
        if (!plate) {
          continue;
        }
        const present = Boolean(seat?.present);
        plate.classList.toggle('is-empty', !present);
        plate.classList.toggle('is-blink', blink?.seat === i && blink.on);
        const caption = plate.querySelector('.hud-caption');
        const name = plate.querySelector('.hud-name');
        if (caption) {
          caption.textContent = seat?.caption ?? '';
        }
        if (name) {
          name.textContent = present ? (seat?.name ?? '') : '';
        }
      }
    },
    showTalk(box, text, side): void {
      const { x, y, w, h } = talkBubbleLayout(box, side);
      const tail = side === 'west' ? 'east' : 'west';
      bubbles.innerHTML = bubbleMarkup(x, y, w, h, text, tail);
    },
    showChoice(box, left, right): void {
      const { leftX, rightX, y, w, h } = choiceBubbleLayout(box);
      bubbles.innerHTML =
        bubbleMarkup(leftX, y, w, h, left, 'east') + bubbleMarkup(rightX, y, w, h, right, 'west');
    },
    hideBubbles(): void {
      bubbles.innerHTML = '';
    },
  };
}
