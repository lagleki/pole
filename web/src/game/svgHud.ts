/**
 * SVG seat plaques and speech bubbles (DIFF #19).
 * Plaques tuck under the drum; talk/choice clouds sit above the sprite head.
 */
import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { liveSeat } from './constants';
import { snickersBarArtMarkup } from './svgSnickers';
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
  /** null hides the pile (empty seat). 0 shows the empty-score candy. */
  score: number | null;
  /** Recount jitter, DOS wrap offsets mapped to x/y. */
  jitter?: { x: number; y: number };
}

export interface HudNameEntry {
  seat: number;
  text: string;
  caret: boolean;
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
  setNameEntry(entry: HudNameEntry | null): void;
  showTalk(box: SpriteBox, text: string, side: 'west' | 'east'): void;
  showChoice(box: SpriteBox, left: string, right: string): void;
  /** Single yellow choice bubble on the player's right (DIFF #31). */
  showSingleChoice(box: SpriteBox, text: string): void;
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

/** Right-hand choice cloud only — used for a single confirm action. */
export function singleChoiceBubbleLayout(box: SpriteBox, text: string): BubbleBox {
  const size = bubbleForText(text);
  const y = aboveHeadY(box, size.h);
  const cx = box.x + box.w / 2;
  return { ...size, x: clampX(cx + BUBBLE_GAP / 2, size.w), y };
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
      <rect class="hud-caret" x="0" y="24" width="6" height="2" fill="#ffffff" display="none"/>
    </g>`;
}

function moneyGroupMarkup(seatIdx: number): string {
  const { x, y } = ofsXy(liveSeat(seatIdx).moneyOfs);
  return `<g class="hud-money" data-seat="${seatIdx}" transform="translate(${x} ${y})" display="none"></g>`;
}

/** Original MONEY sprite is 73×24; SVG note is a bit larger so the green reads. */
export const BILL_W = 76;
export const BILL_H = 24;
export const BILL_STACK_DY = 3.2;
export const BILL_STACK_DX = 1.4;
export const BILL_MAX = 5;

/**
 * Dollar-bill mark adapted from Twemoji 1f4b5
 * (https://github.com/twitter/twemoji, CC-BY 4.0).
 * Simple rects/ellipse — not <use>/nested <svg>, so it stays green after DOMParser insert.
 */
export function usdBillArtMarkup(): string {
  return `<rect width="${BILL_W}" height="${BILL_H}" rx="2.2" fill="#3e8f3a"/>
      <rect x="1.4" y="1.4" width="${BILL_W - 2.8}" height="${BILL_H - 2.8}" rx="1.5"
            fill="#6fbf63" stroke="#2d6b2c" stroke-width="0.7"/>
      <ellipse cx="${BILL_W * 0.72}" cy="${BILL_H / 2}" rx="9" ry="7.2" fill="#4ea34a"/>
      <rect x="${BILL_W * 0.36}" y="1.4" width="10" height="${BILL_H - 2.8}" fill="#f3d48a"/>
      <text x="${BILL_W * 0.18}" y="${BILL_H / 2 + 0.6}" fill="#2d6b2c" stroke="none"
            font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="central">$</text>`;
}

function billInstanceMarkup(dx: number, dy: number, tilt: number): string {
  return `<g class="hud-bill" fill="none" stroke="none" transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)}) rotate(${tilt} ${BILL_W / 2} ${BILL_H / 2})">
      ${usdBillArtMarkup()}
    </g>`;
}

export function moneyStackCount(score: number): number {
  if (score <= 0) {
    return 0;
  }
  return Math.min(BILL_MAX, Math.max(1, Math.ceil(score / 500)));
}

/** Top-bill local origin after stack offsets (jitter applied to the top note). */
export function moneyTopBillOrigin(n: number, jitter?: { x: number; y: number }): { x: number; y: number } {
  const jx = jitter?.x ?? 0;
  const jy = jitter?.y ?? 0;
  return {
    x: (n - 1) * BILL_STACK_DX + jx,
    y: -(n - 1) * BILL_STACK_DY + jy,
  };
}

export function moneyStackMarkup(score: number, jitter?: { x: number; y: number }): string {
  if (score <= 0) {
    const jx = jitter?.x ?? 0;
    const jy = jitter?.y ?? 0;
    return `<g class="hud-candy" transform="translate(${jx.toFixed(1)} ${jy.toFixed(1)})">
      ${snickersBarArtMarkup()}
    </g>`;
  }
  const n = moneyStackCount(score);
  const bills: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const dx = i * BILL_STACK_DX + (i === n - 1 ? (jitter?.x ?? 0) : 0);
    const dy = -i * BILL_STACK_DY + (i === n - 1 ? (jitter?.y ?? 0) : 0);
    const tilt = ((i % 3) - 1) * 1.2;
    bills.push(billInstanceMarkup(dx, dy, tilt));
  }
  const top = moneyTopBillOrigin(n, jitter);
  const cx = top.x + BILL_W / 2;
  const cy = top.y + BILL_H / 2;
  return `<g class="hud-bills">${bills.join('')}</g>
    <text class="hud-score" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}"
          text-anchor="middle" dominant-baseline="central">${escapeSvgText(String(score))}</text>`;
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
      </g>
      <g id="hud-money-row" font-family="PT Mono, ui-monospace, monospace" font-weight="700">
        ${moneyGroupMarkup(0)}${moneyGroupMarkup(1)}${moneyGroupMarkup(2)}
      </g>`);
}

export function buildBubbleSvg(): string {
  return svgShell(`<g id="hud-bubbles" font-family="PT Mono, ui-monospace, monospace" font-weight="700"
         font-size="11" fill="#1a1520"></g>`);
}

const NAME_FONT = 9;
const NAME_CHAR_EM = 0.62;
const NAME_PAD_X = 8;
const NAME_CARET_Y = 24;

export function setSvgChildren(host: SVGElement, markup: string): void {
  const parsed = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
    'image/svg+xml',
  );
  const root = parsed.documentElement;
  host.replaceChildren();
  if (root.querySelector('parsererror')) {
    return;
  }
  for (const node of [...root.childNodes]) {
    host.appendChild(host.ownerDocument.importNode(node, true));
  }
}

export function nameCaretX(text: string): number {
  return NAME_PAD_X + text.length * NAME_FONT * NAME_CHAR_EM;
}

export function mountSvgHud(plateHost: HTMLElement, bubbleHost: HTMLElement): HudView {
  plateHost.innerHTML = buildHudSvg();
  bubbleHost.innerHTML = buildBubbleSvg();
  plateHost.hidden = true;
  bubbleHost.hidden = true;
  const plates = [...plateHost.querySelectorAll<SVGGElement>('.hud-plate')];
  const moneyGroups = [...plateHost.querySelectorAll<SVGGElement>('.hud-money')];
  const bubbles = bubbleHost.querySelector<SVGGElement>('#hud-bubbles');
  if (!bubbles) {
    throw new Error('SVG HUD bubbles missing');
  }
  let nameEntry: HudNameEntry | null = null;

  const paintName = (plate: SVGGElement, seatIdx: number, name: string, present: boolean): void => {
    const nameEl = plate.querySelector<SVGTextElement>('.hud-name');
    const caret = plate.querySelector<SVGRectElement>('.hud-caret');
    if (!nameEl || !caret) {
      return;
    }
    const entry = nameEntry;
    const editing = entry !== null && entry.seat === seatIdx;
    const shown = editing ? entry.text : present ? name : '';
    nameEl.textContent = shown;
    if (editing) {
      nameEl.setAttribute('text-anchor', 'start');
      nameEl.setAttribute('x', String(NAME_PAD_X));
      caret.setAttribute('x', nameCaretX(shown).toFixed(1));
      caret.setAttribute('y', String(NAME_CARET_Y));
      caret.setAttribute('display', entry.caret ? 'inline' : 'none');
    } else {
      nameEl.setAttribute('text-anchor', 'middle');
      nameEl.setAttribute('x', String(PLATE_W / 2));
      caret.setAttribute('display', 'none');
    }
  };

  return {
    setVisible(visible: boolean): void {
      plateHost.hidden = !visible;
      bubbleHost.hidden = !visible;
    },
    setSeats(seats, blink): void {
      for (let i = 0; i < plates.length; i += 1) {
        const plate = plates[i];
        const money = moneyGroups[i];
        const seat = seats[i];
        if (!plate) {
          continue;
        }
        const present = Boolean(seat?.present);
        plate.classList.toggle('is-empty', !present);
        plate.classList.toggle('is-blink', blink?.seat === i && blink.on);
        plate.setAttribute('display', present ? 'inline' : 'none');
        const caption = plate.querySelector('.hud-caption');
        if (caption) {
          caption.textContent = present ? (seat?.caption ?? '') : '';
        }
        paintName(plate, i, seat?.name ?? '', present);
        if (money) {
          const score = seat?.score ?? null;
          if (!present || score === null) {
            money.setAttribute('display', 'none');
            money.replaceChildren();
          } else {
            money.setAttribute('display', 'inline');
            setSvgChildren(money, moneyStackMarkup(score, seat.jitter));
          }
        }
      }
    },
    setNameEntry(entry): void {
      nameEntry = entry;
      if (entry) {
        const plate = plates[entry.seat];
        if (plate) {
          paintName(plate, entry.seat, entry.text, true);
        }
        return;
      }
      for (let i = 0; i < plates.length; i += 1) {
        const plateEl = plates[i];
        if (!plateEl) {
          continue;
        }
        const nameEl = plateEl.querySelector<SVGTextElement>('.hud-name');
        paintName(plateEl, i, nameEl?.textContent ?? '', plateEl.getAttribute('display') !== 'none');
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
    showSingleChoice(box, text): void {
      const laid = singleChoiceBubbleLayout(box, text);
      bubbles.innerHTML = bubbleMarkup(laid, 'south-west');
    },
    hideBubbles(): void {
      bubbles.innerHTML = '';
    },
  };
}
