/**
 * SVG fortune drum overlay (DIFF #19 / #26). Classic 36-sector TV layout.
 * Larger disk, hub low; clipped at the alphabet row. Live play stacks this
 * above the rear canvas; pegs sit higher so handles stay crisp over the disk.
 * punchWheelHole() remains for tests / optional canvas-on-top presenters.
 */
import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { defaultRenderSpec } from '../spec';
import { DRUM_NUDGE_X } from './constants';
import { WHEEL_SECTOR_COUNT, WHEEL_SECTORS, type TvSector, wheelSectorLabel, wheelSectorLabelFontSize } from './tvWheel';

export interface WheelView {
  setFrame(sector: number): void;
  setAngle(degrees: number): void;
  setVisible(visible: boolean): void;
}

/** Original DOS cell — hub stays on its horizontal midline. */
const { x: BOX_X, y: BOX_Y, width: BOX_W } = defaultRenderSpec.wheel.clearRect;
/** Alphabet row (letter backs at 0x14c). Overlay stops here so the drum tucks under the letters. */
const CLIP_Y = 0x14c;
const HUB_X = BOX_X + BOX_W / 2 + DRUM_NUDGE_X;
/** Shifted down vs the DOS cell center so a bigger disk tucks under the letters. */
const HUB_Y = 346;
const R = 136;
const PEG = 11;
/** Punch only the disk (not the pegs) so bricks stay visible around the handles. */
const HOLE_R = R + 2;
const LABEL_R = R - 12;
const ARROW_LEN = R * 0.86;
const STEP_DEG = 360 / WHEEL_SECTOR_COUNT;
const HALF_WEDGE = STEP_DEG / 2;

function ega(index: number): string {
  const [r, g, b] = defaultRenderSpec.palette[index];
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function topWedgePath(): string {
  const a0 = ((-90 - HALF_WEDGE) * Math.PI) / 180;
  const a1 = ((-90 + HALF_WEDGE) * Math.PI) / 180;
  const x0 = (R * Math.cos(a0)).toFixed(2);
  const y0 = (R * Math.sin(a0)).toFixed(2);
  const x1 = (R * Math.cos(a1)).toFixed(2);
  const y1 = (R * Math.sin(a1)).toFixed(2);
  return `M 0 0 L ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1} Z`;
}

function wedgeFill(index: number): { fill: string; ink: string } {
  const black = ega(0);
  const white = ega(15);
  return index % 2 === 0 ? { fill: black, ink: white } : { fill: white, ink: black };
}

function sectorMark(sector: TvSector, ink: string): string {
  const label = wheelSectorLabel(sector);
  const fontSize = wheelSectorLabelFontSize(label);
  return `<text x="0" y="${(-LABEL_R).toFixed(1)}" fill="${ink}" font-size="${fontSize}"
          font-family="PT Mono, ui-monospace, monospace" font-weight="700"
          text-anchor="middle" dominant-baseline="middle">${label}</text>`;
}

function pegMarks(): string {
  return Array.from({ length: WHEEL_SECTOR_COUNT }, (_, i) => {
    const angle = i * STEP_DEG - HALF_WEDGE;
    return `<g transform="rotate(${angle})">
        <path d="M 0 ${-R} Q 5 ${-R - PEG * 0.65} 0 ${-R - PEG}" fill="none" stroke="url(#peg-stem)" stroke-width="2.1" stroke-linecap="round"/>
        <circle cx="0" cy="${-R - PEG - 1.6}" r="3" fill="url(#peg-knob)" stroke="#8a93a3" stroke-width="0.45"/>
      </g>`;
  }).join('');
}

function svgShell(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${inner}
    </svg>`;
}

export function buildWheelSvg(): string {
  const black = ega(0);
  const yellow = ega(14);
  const wedge = topWedgePath();

  const wedges = WHEEL_SECTORS.map((sector, i) => {
    const { fill, ink } = wedgeFill(i);
    return `<g transform="rotate(${i * STEP_DEG})">
        <path d="${wedge}" fill="${fill}"/>
        ${sectorMark(sector, ink)}
      </g>`;
  }).join('');

  return svgShell(`<defs>
        <clipPath id="wheel-letter-clip">
          <rect x="0" y="0" width="640" height="${CLIP_Y}"/>
        </clipPath>
        <linearGradient id="rim-metal" gradientUnits="userSpaceOnUse" x1="${-R}" y1="${-R * 0.4}" x2="${R}" y2="${R * 0.35}">
          <stop offset="0%" stop-color="#4a5160"/>
          <stop offset="22%" stop-color="#9aa3b2"/>
          <stop offset="48%" stop-color="#e8edf4"/>
          <stop offset="62%" stop-color="#b7bec8"/>
          <stop offset="100%" stop-color="#5c6470"/>
        </linearGradient>
        <linearGradient id="arrow-shaft" gradientUnits="userSpaceOnUse" x1="-3" y1="0" x2="3" y2="0">
          <stop offset="0%" stop-color="#5c6470"/>
          <stop offset="32%" stop-color="#e8edf4"/>
          <stop offset="50%" stop-color="#ffffff"/>
          <stop offset="72%" stop-color="#9aa3b2"/>
          <stop offset="100%" stop-color="#4a5160"/>
        </linearGradient>
      </defs>
      <g clip-path="url(#wheel-letter-clip)">
        <g transform="translate(${HUB_X} ${HUB_Y})">
          <g id="wheel-rot">
            ${wedges}
          </g>
          <circle r="${R + 0.6}" fill="none" stroke="url(#rim-metal)" stroke-width="1.15"/>
          <g id="wheel-arrow">
            <path d="M 0 6
              L 1.2 ${-ARROW_LEN + 12}
              L 4.3 ${-ARROW_LEN + 13}
              L 0 ${-ARROW_LEN - 4}
              L -4.3 ${-ARROW_LEN + 13}
              L -1.2 ${-ARROW_LEN + 12}
              Z" fill="url(#arrow-shaft)" stroke="#6a7382" stroke-width="0.5" stroke-linejoin="round"/>
          </g>
          <circle r="9" fill="${black}"/>
          <circle r="3.8" fill="${yellow}"/>
        </g>
      </g>`);
}

export function buildPegsSvg(): string {
  return svgShell(`<defs>
        <clipPath id="pegs-letter-clip">
          <rect x="0" y="0" width="640" height="${CLIP_Y}"/>
        </clipPath>
        <linearGradient id="peg-stem" gradientUnits="userSpaceOnUse" x1="-3" y1="0" x2="3" y2="0">
          <stop offset="0%" stop-color="#6e7684"/>
          <stop offset="35%" stop-color="#e8edf4"/>
          <stop offset="55%" stop-color="#ffffff"/>
          <stop offset="78%" stop-color="#9aa3b2"/>
          <stop offset="100%" stop-color="#5c6470"/>
        </linearGradient>
        <radialGradient id="peg-knob" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="35%" stop-color="#d5dce6"/>
          <stop offset="70%" stop-color="#8b93a2"/>
          <stop offset="100%" stop-color="#4a5160"/>
        </radialGradient>
      </defs>
      <g clip-path="url(#pegs-letter-clip)">
        <g transform="translate(${HUB_X} ${HUB_Y})">
          <g id="wheel-pegs-rot">${pegMarks()}</g>
        </g>
      </g>`);
}

export function mountSvgWheel(diskHost: HTMLElement, pegsHost?: HTMLElement): WheelView {
  diskHost.innerHTML = buildWheelSvg();
  diskHost.hidden = true;
  const rotator = diskHost.querySelector<SVGGElement>('#wheel-rot');
  if (!rotator) {
    throw new Error('SVG wheel rotator missing');
  }
  let pegsRotator: SVGGElement | null = null;
  if (pegsHost) {
    pegsHost.innerHTML = buildPegsSvg();
    pegsHost.hidden = true;
    pegsRotator = pegsHost.querySelector<SVGGElement>('#wheel-pegs-rot');
    if (!pegsRotator) {
      throw new Error('SVG wheel pegs rotator missing');
    }
  }

  const applyAngle = (degrees: number): void => {
    const rot = `rotate(${degrees})`;
    rotator.setAttribute('transform', rot);
    pegsRotator?.setAttribute('transform', rot);
  };

  return {
    setFrame(sector: number): void {
      const i = ((sector % WHEEL_SECTOR_COUNT) + WHEEL_SECTOR_COUNT) % WHEEL_SECTOR_COUNT;
      applyAngle(-i * STEP_DEG);
    },
    setAngle(degrees: number): void {
      applyAngle(degrees);
    },
    setVisible(visible: boolean): void {
      diskHost.hidden = !visible;
      if (pegsHost) {
        pegsHost.hidden = !visible;
      }
    },
  };
}

/** Opaque sprite pixels to leave on the canvas inside the drum hole (the letter hand). */
export interface WheelHoleKeep {
  ofs: number;
  width: number;
  height: number;
  pixels: Uint8Array;
  transparent: number;
}

/**
 * Make the drum disk transparent on the DOS canvas so a legacy stack with the
 * SVG wheel behind the canvas can show through (tests / optional presenters).
 * Live play keeps the canvas at the back of the DOM stack, so overlays sit on
 * top without punching. Down to the alphabet row — players and name plates
 * included when this is used. The alphabet strip (y ≥ CLIP_Y) is also punched so
 * the SVG letter tiles show through; the pointing hand is then painted from
 * the sprite itself (not leftover floor pixels), so moving it cannot leave a
 * gray silhouette on the hole.
 */
/** Half-width of the soft feather band at the hole edge, in CSS pixels. */
const FEATHER = 2;

export function punchWheelHole(rgba: Uint8ClampedArray, keep?: WheelHoleKeep | null): void {
  const outerR = HOLE_R + FEATHER;
  const outerR2 = outerR * outerR;
  const innerR = HOLE_R - FEATHER;
  const innerR2 = innerR * innerR;

  const x0 = Math.max(0, Math.floor(HUB_X - outerR));
  const x1 = Math.min(SCREEN_W, Math.ceil(HUB_X + outerR));
  const y0 = Math.max(0, Math.floor(HUB_Y - outerR));
  const y1 = Math.min(CLIP_Y, Math.ceil(HUB_Y + outerR));

  for (let y = y0; y < y1; y += 1) {
    const dy = y - HUB_Y;
    const dy2 = dy * dy;
    for (let x = x0; x < x1; x += 1) {
      const dx = x - HUB_X;
      const d2 = dx * dx + dy2;
      if (d2 > outerR2) {
        continue;
      }
      const i = (y * SCREEN_W + x) * 4 + 3;
      if (d2 <= innerR2) {
        // Fully inside — punch through.
        rgba[i] = 0;
      } else {
        // Feather band: blend from opaque (outer edge) to transparent (inner edge).
        const d = Math.sqrt(d2);
        const t = (outerR - d) / (FEATHER * 2); // 0 at outer edge → 1 at inner edge
        rgba[i] = Math.round(rgba[i] * (1 - t));
      }
    }
  }

  for (let y = CLIP_Y; y < VISIBLE_H; y += 1) {
    const row = y * SCREEN_W * 4;
    for (let x = 0; x < SCREEN_W; x += 1) {
      rgba[row + x * 4 + 3] = 0;
    }
  }

  if (keep) {
    blitHandOverHole(rgba, keep);
  }
}

function blitHandOverHole(rgba: Uint8ClampedArray, keep: WheelHoleKeep): void {
  const palette = defaultRenderSpec.palette;
  const keepX = keep.ofs % SCREEN_W;
  const keepY = Math.floor(keep.ofs / SCREEN_W);
  for (let ly = 0; ly < keep.height; ly += 1) {
    const y = keepY + ly;
    if (y < 0 || y >= VISIBLE_H) {
      continue;
    }
    for (let lx = 0; lx < keep.width; lx += 1) {
      const value = keep.pixels[ly * keep.width + lx];
      if (value === keep.transparent) {
        continue;
      }
      const x = keepX + lx;
      if (x < 0 || x >= SCREEN_W) {
        continue;
      }
      if (y < CLIP_Y) {
        const dx = x - HUB_X;
        const dy = y - HUB_Y;
        if (dx * dx + dy * dy > HOLE_R * HOLE_R) {
          continue;
        }
      }
      const color = palette[value & 0x0f];
      const i = (y * SCREEN_W + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }
}

export const svgWheelLayout = {
  box: { x: BOX_X, y: BOX_Y, width: BOX_W, height: defaultRenderSpec.wheel.clearRect.height },
  center: { x: HUB_X, y: HUB_Y },
  radii: { x: R, y: R },
  holeR: HOLE_R,
  clipY: CLIP_Y,
  halfStepDeg: STEP_DEG,
};
