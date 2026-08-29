/**
 * SVG seat plaques and speech bubbles (DIFF #19).
 * Plaques tuck under the drum; talk/choice clouds sit above the sprite head.
 */
import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { liveSeat } from './constants';
import { svgWheelLayout } from './svgWheel';

export const PLATE_W = 108;
export const PLATE_H = 28;
export const BUBBLE_GAP = 8;
const TAIL_H = 8;
const TEXT_PAD_X = 8;
const TEXT_PAD_Y = 6;
const FONT_SIZE = 11;
const CHAR_EM = 0.62;
const LINE_GAP = 2;
const SCREEN_PAD = 3;
const HEAD_GAP = 4;
/** Each cloud is at most 10% of the 640-wide screen. */
export const BUBBLE_MAX_W = SCREEN_W * 0.1;
const BUBBLE_MIN_W = 48;

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
  lines: string[];
}

export function wrapBubbleText(text: string, maxBodyW: number, fontSize: number): string[] {
  const maxChars = Math.max(4, Math.floor((maxBodyW - TEXT_PAD_X * 2) / (fontSize * CHAR_EM)));
  const trimmed = text.trim() || ' ';
  const words = trimmed.split(/\s+/u);
  const lines: string[] = [];
  const pushChunks = (chunk: string): void => {
    for (let i = 0; i < chunk.length; i += maxChars) {
      lines.push(chunk.slice(i, i + maxChars));
    }
  };
  if (words.length <= 1) {
    pushChunks(trimmed);
    return lines;
  }
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) {
        lines.push(cur);
      }
      if (word.length > maxChars) {
        pushChunks(word);
        cur = '';
      } else {
        cur = word;
      }
    }
  }
  if (cur) {
    lines.push(cur);
  }
  return lines.length > 0 ? lines : [' '];
}

export function bubbleForText(text: string): { w: number; h: number; fontSize: number; lines: string[] } {
  const fontSize = FONT_SIZE;
  const maxBody = BUBBLE_MAX_W;
  const lines = wrapBubbleText(text, maxBody, fontSize);
  const longest = lines.reduce((m, line) => Math.max(m, line.length), 1);
  const textW = Math.ceil(longest * fontSize * CHAR_EM);
  const w = Math.min(BUBBLE_MAX_W, Math.max(BUBBLE_MIN_W, textW + TEXT_PAD_X * 2));
  const h = TEXT_PAD_Y * 2 + lines.length * (fontSize + LINE_GAP);
  return { w, h, fontSize, lines };
}

function clampX(x: number, w: number): number {
  return Math.max(SCREEN_PAD, Math.min(SCREEN_W - SCREEN_PAD - w, x));
}

function aboveHeadY(box: SpriteBox, h: number): number {
  const y = box.y - HEAD_GAP - TAIL_H - h;
  return Math.max(SCREEN_PAD, Math.min(VISIBLE_H - SCREEN_PAD - h - TAIL_H, y));
}

/** Choice pair above the sprite head, same y, no overlap, each ≤ 30% screen width. */
export function choiceBubbleLayout(
  box: SpriteBox,
  leftText: string,
  rightText: string,
): { left: BubbleBox; right: BubbleBox } {
  const leftSize = bubbleForText(leftText);
  const rightSize = bubbleForText(rightText);
  const h = Math.max(leftSize.h, rightSize.h);
  const y = aboveHeadY(box, h);
  const cx = box.x + box.w / 2;
  let leftX = cx - BUBBLE_GAP / 2 - leftSize.w;
  let rightX = cx + BUBBLE_GAP / 2;
  const pairRight = rightX + rightSize.w;
  if (leftX < SCREEN_PAD) {
    const shift = SCREEN_PAD - leftX;
    leftX += shift;
    rightX += shift;
  }
  if (pairRight > SCREEN_W - SCREEN_PAD) {
    const shift = pairRight - (SCREEN_W - SCREEN_PAD);
    leftX -= shift;
    rightX -= shift;
  }
  leftX = clampX(leftX, leftSize.w);
  rightX = clampX(rightX, rightSize.w);
  if (leftX + leftSize.w + BUBBLE_GAP > rightX) {
    rightX = leftX + leftSize.w + BUBBLE_GAP;
    if (rightX + rightSize.w > SCREEN_W - SCREEN_PAD) {
      rightX = SCREEN_W - SCREEN_PAD - rightSize.w;
      leftX = Math.min(leftX, rightX - BUBBLE_GAP - leftSize.w);
      leftX = clampX(leftX, leftSize.w);
    }
  }
  return {
    left: { ...leftSize, h, x: leftX, y },
    right: { ...rightSize, h, x: rightX, y },
  };
}

export function talkBubbleLayout(box: SpriteBox, text: string, side: 'west' | 'east'): BubbleBox {
  const size = bubbleForText(text);
  const y = aboveHeadY(box, size.h);
  const preferred =
    side === 'west' ? box.x + box.w / 2 - size.w * 0.65 : box.x + box.w / 2 - size.w * 0.35;
  return { ...size, x: clampX(preferred, size.w), y };
}

function bubbleMarkup(box: BubbleBox, tail: 'south' | 'south-east' | 'south-west'): string {
  const midX = box.w / 2;
  const tailX =
    tail === 'south-east' ? box.w * 0.72 : tail === 'south-west' ? box.w * 0.28 : midX;
  const lineH = box.fontSize + LINE_GAP;
  const textTop = TEXT_PAD_Y + box.fontSize * 0.8;
  const tspans = box.lines
    .map(
      (line, i) =>
        `<tspan x="${(box.w / 2).toFixed(1)}" y="${(textTop + i * lineH).toFixed(1)}">${escapeSvgText(line)}</tspan>`,
    )
    .join('');
  return `<g class="hud-bubble" transform="translate(${box.x.toFixed(1)} ${box.y.toFixed(1)})">
      <polygon points="${(tailX - 6).toFixed(1)},${box.h - 1} ${tailX.toFixed(1)},${box.h + TAIL_H} ${(tailX + 6).toFixed(1)},${box.h - 1}"
            fill="#ffe566" stroke="#2a2030" stroke-width="0.8"/>
      <rect x="0.5" y="0.5" width="${box.w - 1}" height="${box.h - 1}" rx="8"
            fill="#ffe566" stroke="#2a2030" stroke-width="0.8"/>
      <text text-anchor="middle" font-size="${box.fontSize}">${tspans}</text>
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
      bubbles.innerHTML = bubbleMarkup(laid, 'south');
    },
    showChoice(box, left, right): void {
      const laid = choiceBubbleLayout(box, left, right);
      bubbles.innerHTML =
        bubbleMarkup(laid.left, 'south-east') + bubbleMarkup(laid.right, 'south-west');
    },
    hideBubbles(): void {
      bubbles.innerHTML = '';
    },
  };
}
