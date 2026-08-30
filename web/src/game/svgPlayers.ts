/**
 * SVG player / NPC seat sprites + decision lean (DIFF #19).
 * Original PLAYER_* / CHARACTER_* blits as run-length SVG rects, clipped under
 * the drum like the name plates so seat 0 tucks behind the disk.
 */
import type { PaletteColor } from '../spec/types';
import { SCREEN_W } from '../engine/types';
import { CHARACTERS, DECISION_ANIM, liveSeat } from './constants';
import { indexedSpriteToSvg, setSvgShown } from './svgAssist';
import { setSvgChildren } from './svgHud';
import { svgWheelLayout } from './svgWheel';

export const PLAYER_TRANSPARENT = 2;

/** Unique sprite ids loaded into <defs> (lean poses + NPC roster). */
export const PLAYER_ART_IDS: readonly number[] = [
  ...new Set<number>([...DECISION_ANIM, ...CHARACTERS.map((c) => c.spriteId)]),
];

export interface PlayerSeatPose {
  spriteId: number | null;
  ofs: number;
}

export interface PlayersView {
  loadSprites(
    sprites: readonly { width: number; height: number; pixels: Uint8Array }[],
    palette: readonly PaletteColor[],
  ): void;
  setVisible(visible: boolean): void;
  /** Paint all three seats from game state. */
  sync(seats: readonly PlayerSeatPose[]): void;
  /** Swap one seat's visible frame (decision lean); null hides. */
  setSeat(seatIdx: number, spriteId: number | null): void;
}

export function playerXY(ofs: number): { x: number; y: number } {
  return { x: ofs % SCREEN_W, y: Math.floor(ofs / SCREEN_W) };
}

function drumClipPath(): string {
  const { x: cx, y: cy } = svgWheelLayout.center;
  const r = svgWheelLayout.holeR;
  return `M0,0h640v350h-640Z M${cx},${cy} m ${-r},0 a ${r},${r} 0 1,1 ${2 * r},0 a ${r},${r} 0 1,1 ${-2 * r},0`;
}

export function buildPlayersSvg(): string {
  const arts = PLAYER_ART_IDS.map((id) => `<g id="player-art-${id}"></g>`).join('');
  const seats = [0, 1, 2]
    .map((i) => {
      const { x, y } = playerXY(liveSeat(i).spriteOfs);
      return `<g class="player-seat" data-seat="${i}" transform="translate(${x} ${y})" display="none"></g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <clipPath id="players-under-drum" clipPathUnits="userSpaceOnUse">
          <path clip-rule="evenodd" d="${drumClipPath()}"/>
        </clipPath>
        ${arts}
      </defs>
      <g id="players-root" display="none" clip-path="url(#players-under-drum)">${seats}</g>
    </svg>`;
}

function paintSeat(el: SVGGElement, spriteId: number | null, ofs?: number): void {
  if (ofs !== undefined) {
    const { x, y } = playerXY(ofs);
    el.setAttribute('transform', `translate(${x} ${y})`);
  }
  if (spriteId === null) {
    setSvgChildren(el, '');
    setSvgShown(el, false);
    return;
  }
  setSvgChildren(el, `<use href="#player-art-${spriteId}"/>`);
  setSvgShown(el, true);
}

export function mountSvgPlayers(host: HTMLElement): PlayersView {
  host.innerHTML = buildPlayersSvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#players-root');
  const seats = [0, 1, 2].map((i) => {
    const el = host.querySelector<SVGGElement>(`.player-seat[data-seat="${i}"]`);
    if (!el) {
      throw new Error(`SVG player seat ${i} missing`);
    }
    return el;
  });
  if (!root) {
    throw new Error('SVG players mount failed');
  }

  return {
    loadSprites(sprites, palette): void {
      for (const id of PLAYER_ART_IDS) {
        const art = host.querySelector<SVGGElement>(`#player-art-${id}`);
        const sprite = sprites[id];
        if (!art || !sprite) {
          continue;
        }
        art.innerHTML = indexedSpriteToSvg(
          sprite.pixels,
          sprite.width,
          sprite.height,
          PLAYER_TRANSPARENT,
          palette,
        );
      }
    },
    setVisible(visible: boolean): void {
      setSvgShown(root, visible);
      host.hidden = !visible;
      if (!visible) {
        for (const seat of seats) {
          setSvgChildren(seat, '');
          setSvgShown(seat, false);
        }
      }
    },
    sync(poses): void {
      setSvgShown(root, true);
      host.hidden = false;
      for (let i = 0; i < seats.length; i += 1) {
        const pose = poses[i];
        paintSeat(seats[i], pose?.spriteId ?? null, pose?.ofs);
      }
    },
    setSeat(seatIdx, spriteId): void {
      const el = seats[seatIdx];
      if (!el) {
        return;
      }
      setSvgShown(root, true);
      host.hidden = false;
      paintSeat(el, spriteId);
    },
  };
}
