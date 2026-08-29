/**
 * SVG seat plaques and speech bubbles (DIFF #19).
 * Plaques sit behind the drum; talk/choice clouds stay inside the sprite box
 * and the pair is vertically centered on the sprite.
 */
import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { liveSeat } from './constants';
import { svgWheelLayout } from './svgWheel';

export const PLATE_W = 108;
export const PLATE_H = 28;
export const BUBBLE_H = 34;
export const BUBBLE_GAP = 6;
const TAIL_W = 8;
const TEXT_PAD_X = 10;
const FONT_SIZE = 11;
const CHAR_EM = 0.62;
const SCREEN_PAD = 3;
/** Bubbles may stick out of the sprite this far, but never off the 640×350 screen. */
const SPRITE_SLACK = 24;

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

export interface BubbleBox {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
}

export function bubbleForText(text: string): { w: number; h: number; fontSize: number } {
  let fontSize = FONT_SIZE;
  const maxW = SCREEN_W - SCREEN_PAD * 2;
  const body = (fs: number): number => Math.ceil(Math.max(1, text.length) * fs * CHAR_EM) + TEXT_PAD_X * 2;
  let w = body(fontSize) + TAIL_W;
  while (w > maxW && fontSize > 8) {
    fontSize -= 1;
    w = body(fontSize) + TAIL_W;
  }
  w = Math.min(Math.max(w, 40), maxW);
  const h = Math.max(26, fontSize + 18);
  return { w, h, fontSize };
}

function clampBubble(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return {
    x: Math.max(SCREEN_PAD, Math.min(SCREEN_W - SCREEN_PAD - w, x)),
    y: Math.max(SCREEN_PAD, Math.min(VISIBLE_H - SCREEN_PAD - h, y)),
  };
}

function spriteSlackRange(box: SpriteBox, w: number): { min: number; max: number } {
  return {
    min: box.x - SPRITE_SLACK,
    max: box.x + box.w + SPRITE_SLACK - w,
  };
}

/** Choice pair: sized to text, vertically centered on the sprite, clamped to the screen. */
export function choiceBubbleLayout(
  box: SpriteBox,
  leftText: string,
  rightText: string,
): { left: BubbleBox; right: BubbleBox } {
  const leftSize = bubbleForText(leftText);
  const rightSize = bubbleForText(rightText);
  const h = Math.max(leftSize.h, rightSize.h);
  const y0 = box.y + box.h / 2 - h / 2;
  const slack = spriteSlackRange(box, leftSize.w);
  let leftX = box.x - SPRITE_SLACK;
  let rightX = box.x + box.w + SPRITE_SLACK - rightSize.w;
  if (leftX + leftSize.w + BUBBLE_GAP > rightX) {
    const mid = box.x + box.w / 2;
    leftX = mid - BUBBLE_GAP / 2 - leftSize.w;
    rightX = mid + BUBBLE_GAP / 2;
  }
  leftX = Math.min(Math.max(leftX, slack.min), slack.max);
  const rightSlack = spriteSlackRange(box, rightSize.w);
  rightX = Math.min(Math.max(rightX, rightSlack.min), rightSlack.max);
  const left = { ...leftSize, h, ...clampBubble(leftX, y0, leftSize.w, h) };
  const right = { ...rightSize, h, ...clampBubble(rightX, y0, rightSize.w, h) };
  return { left, right };
}

export function talkBubbleLayout(box: SpriteBox, text: string, side: 'west' | 'east'): BubbleBox {
  const size = bubbleForText(text);
  const y0 = box.y + box.h / 2 - size.h / 2;
  const slack = spriteSlackRange(box, size.w);
  const preferred = side === 'west' ? box.x - SPRITE_SLACK : box.x + box.w + SPRITE_SLACK - size.w;
  const x0 = Math.min(Math.max(preferred, slack.min), slack.max);
  return { ...size, ...clampBubble(x0, y0, size.w, size.h) };
}

function bubbleMarkup(box: BubbleBox, text: string, tail: 'east' | 'west'): string {
  const tailW = TAIL_W;
  const bodyW = box.w - tailW;
  const bodyX = tail === 'west' ? tailW : 0;
  const mid = box.h / 2;
  const tailPts =
    tail === 'east'
      ? `${bodyW - 1},${mid - 5} ${box.w},${mid} ${bodyW - 1},${mid + 5}`
      : `${tailW + 1},${mid - 5} 0,${mid} ${tailW + 1},${mid + 5}`;
  return `<g class="hud-bubble" transform="translate(${box.x.toFixed(1)} ${box.y.toFixed(1)})">
      <polygon points="${tailPts}" fill="#ffe566" stroke="#2a2030" stroke-width="0.8"/>
      <rect x="${bodyX}" y="0.5" width="${bodyW}" height="${box.h - 1}" rx="7"
            fill="#ffe566" stroke="#2a2030" stroke-width="0.8"/>
      <text x="${bodyX + bodyW / 2}" y="${mid}" dominant-baseline="central"
            text-anchor="middle" font-size="${box.fontSize}"
            textLength="${Math.max(8, bodyW - 4)}" lengthAdjust="spacingAndGlyphs">${escapeSvgText(text)}</text>
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
        plate.setAttribute('display', present ? 'inline' : 'none');
        const caption = plate.querySelector('.hud-caption');
        const name = plate.querySelector('.hud-name');
        if (caption) {
          caption.textContent = present ? (seat?.caption ?? '') : '';
        }
        if (name) {
          name.textContent = present ? (seat?.name ?? '') : '';
        }
      }
    },
    showTalk(box, text, side): void {
      const laid = talkBubbleLayout(box, text, side);
      const tail = side === 'west' ? 'east' : 'west';
      bubbles.innerHTML = bubbleMarkup(laid, text, tail);
    },
    showChoice(box, left, right): void {
      const laid = choiceBubbleLayout(box, left, right);
      bubbles.innerHTML =
        bubbleMarkup(laid.left, left, 'east') + bubbleMarkup(laid.right, right, 'west');
    },
    hideBubbles(): void {
      bubbles.innerHTML = '';
    },
  };
}
