/**
 * SVG fortune drum overlay (DIFF #19 / #26). Classic 36-sector TV layout.
 *
 * Vertical cylinder standing on the parquet: elliptical top lid (sectors +
 * arrow toward camera) spins with #wheel-rot; tall mantle panels are placed by
 * azimuth between top/bottom ellipses and rebuilt on setAngle (plain SVG
 * rotate() on side quads would tilt strips in-plane — wrong for a drum).
 *
 * Spin contract: setAngle / setFrame drive #wheel-rot / #wheel-pegs-rot
 * rotate(θ) for the top face only, and regenerate #wheel-barrel.
 */
import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { defaultRenderSpec } from '../spec';
import { DRUM_NUDGE_X } from './constants';
import { superPrizeLabel, superPrizeLabelFontSize, SUPER_WHEEL_SECTOR_COUNT, SUPER_WHEEL_STEP_DEG, superWheelPrizes } from './superWheel';
import { WHEEL_SECTOR_COUNT, WHEEL_SECTORS, type TvSector, wheelSectorLabel, wheelSectorLabelFontSize } from './tvWheel';

export interface WheelView {
  setFrame(sector: number): void;
  setAngle(degrees: number): void;
  setVisible(visible: boolean): void;
  setSuperMode(enabled: boolean): void;
  getSectorCount(): number;
  getStepDeg(): number;
}

/** Original DOS cell — hub stays on its horizontal midline. */
const { x: BOX_X, y: BOX_Y, width: BOX_W } = defaultRenderSpec.wheel.clearRect;
/** Full stage height — drum is no longer tucked under a letter row. */
const CLIP_Y = VISIBLE_H;
const HUB_X = BOX_X + BOX_W / 2 + DRUM_NUDGE_X;

/**
 * Isometric vertical cylinder.
 * Top hub (arrow pivot) at TOP_CY; mantle height CYL_H; bottom ellipse rests
 * on the floor (BOT_CY + RY ≈ 343 near VISIBLE_H).
 */
const RX = 148;
/** Vertical foreshortening of the lid / rims (circle → ellipse). */
const TOP_SY = 0.4;
const RY = RX * TOP_SY;
/** Cylinder body height in screen pixels (mantle) — short drum on the floor. */
const CYL_H = 64;
/** Top hub; BOT_CY + RY ≈ 343 rests on the parquet. */
const TOP_CY = 220;
const BOT_CY = TOP_CY + CYL_H;
const PEG = 11;
/** Punch the elliptical top lid (not the pegs / mantle). */
const HOLE_RX = RX + 2;
const HOLE_RY = RY + 2;
const LABEL_R = RX - 12;
const ARROW_LEN = RX * 0.86;
/** Constant half-width of the arrow shaft (no taper along the length). */
const ARROW_SHAFT_HALF = 1.35;
const ARROW_TIP = 5.5;

const STEP_DEG = 360 / WHEEL_SECTOR_COUNT;
const HALF_WEDGE = STEP_DEG / 2;

interface Pt {
  x: number;
  y: number;
}

interface SectorLabel {
  label: string;
  fontSize: number;
}

function ega(index: number): string {
  const [r, g, b] = defaultRenderSpec.palette[index];
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** φ for angle a° (0 = front / toward camera / under arrow), matching wedge convention. */
function phi(angleDeg: number): number {
  return ((90 + angleDeg) * Math.PI) / 180;
}

/** Rim point on the top ellipse (screen space). */
function topRim(angleDeg: number): Pt {
  const a = phi(angleDeg);
  return { x: HUB_X + RX * Math.cos(a), y: TOP_CY + RY * Math.sin(a) };
}

/** Rim point on the bottom ellipse (screen space). */
function botRim(angleDeg: number): Pt {
  const a = phi(angleDeg);
  return { x: HUB_X + RX * Math.cos(a), y: BOT_CY + RY * Math.sin(a) };
}

/**
 * Facing factor for painter / label opacity.
 * +1 = front (near camera, bottom of ellipse), −1 = back (far, top of ellipse).
 */
function facingOf(angleDeg: number): number {
  return Math.sin(phi(angleDeg));
}

function topWedgePathFor(halfWedge: number): string {
  // Front wedge in local space (+Y toward camera); sector 0 sits under the arrow at θ=0.
  const a0 = ((90 - halfWedge) * Math.PI) / 180;
  const a1 = ((90 + halfWedge) * Math.PI) / 180;
  const x0 = (RX * Math.cos(a0)).toFixed(2);
  const y0 = (RX * Math.sin(a0)).toFixed(2);
  const x1 = (RX * Math.cos(a1)).toFixed(2);
  const y1 = (RX * Math.sin(a1)).toFixed(2);
  return `M 0 0 L ${x0} ${y0} A ${RX} ${RX} 0 0 1 ${x1} ${y1} Z`;
}

function topWedgePath(): string {
  return topWedgePathFor(HALF_WEDGE);
}

function wedgeFill(index: number): { fill: string; ink: string } {
  const black = ega(0);
  const white = ega(15);
  return index % 2 === 0 ? { fill: black, ink: white } : { fill: white, ink: black };
}

function sectorMark(sector: TvSector, ink: string): string {
  const label = wheelSectorLabel(sector);
  const fontSize = wheelSectorLabelFontSize(label);
  return `<text x="0" y="${LABEL_R.toFixed(1)}" fill="${ink}" font-size="${fontSize}"
          font-family="PT Mono, ui-monospace, monospace" font-weight="700"
          text-anchor="middle" dominant-baseline="middle">${label}</text>`;
}

function barrelPanelPath(angle0: number, angle1: number): string {
  const t0 = topRim(angle0);
  const t1 = topRim(angle1);
  const b1 = botRim(angle1);
  const b0 = botRim(angle0);
  return `M ${t0.x.toFixed(2)} ${t0.y.toFixed(2)} L ${t1.x.toFixed(2)} ${t1.y.toFixed(2)} L ${b1.x.toFixed(2)} ${b1.y.toFixed(2)} L ${b0.x.toFixed(2)} ${b0.y.toFixed(2)} Z`;
}

function shadeFill(fill: string, facing: number): string {
  // Slightly mute back / edge-on panels so the drum reads as round.
  if (facing >= 0.15) {
    return fill;
  }
  if (fill === ega(0)) {
    return facing < -0.2 ? '#1a1a1a' : '#0a0a0a';
  }
  if (facing < -0.2) {
    return '#c8c8c8';
  }
  return '#e8e8e8';
}

function sideLabelMarkup(
  midAngleDeg: number,
  label: string,
  ink: string,
  faceFontSize: number,
): string {
  const facing = facingOf(midAngleDeg);
  // Painted on the visible front of the mantle only (rotate with θ via barrelMarkup).
  if (facing < 0.12) {
    return '';
  }
  const top = topRim(midAngleDeg);
  const bot = botRim(midAngleDeg);
  // Upper band of the side wall (just under the lid).
  const band = 0.16;
  const x = top.x * (1 - band) + bot.x * band;
  const y = top.y * (1 - band) + bot.y * band;
  // Tangent of the top rim so the glyph sits on the cylinder surface.
  const t0 = topRim(midAngleDeg - 3);
  const t1 = topRim(midAngleDeg + 3);
  // +180 so glyphs read upright on the mantle (tangent alone was upside-down).
  const rot = (Math.atan2(t1.y - t0.y, t1.x - t0.x) * 180) / Math.PI + 180;
  const opacity = Math.max(0.35, Math.min(1, facing * 1.2));
  const fontSize = Math.max(6, Math.round(faceFontSize * 0.62 * 10) / 10);
  return `<text fill="${ink}" font-size="${fontSize}"
          font-family="PT Mono, ui-monospace, monospace" font-weight="700"
          text-anchor="middle" dominant-baseline="middle"
          opacity="${opacity.toFixed(2)}"
          transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rot.toFixed(2)})">${label}</text>`;
}

/**
 * Mantle panels for the current spin angle θ.
 * Panel azimuth = sectorIndex * step + θ (same convention as face rotate(θ)).
 * Sorted back→front (painter's algorithm); full mantle sits behind the top lid
 * in the DOM, with labels only on front-facing panels.
 */
export function barrelMarkup(
  sectorCount: number,
  stepDeg: number,
  halfWedge: number,
  thetaDeg: number,
  labelAt: (index: number) => SectorLabel,
): string {
  type Panel = { facing: number; path: string; label: string };
  const panels: Panel[] = [];
  for (let i = 0; i < sectorCount; i += 1) {
    const { fill, ink } = wedgeFill(i);
    const mid0 = i * stepDeg + thetaDeg;
    const a0 = mid0 - halfWedge;
    const a1 = mid0 + halfWedge;
    const facing = facingOf(mid0);
    const { label, fontSize } = labelAt(i);
    panels.push({
      facing,
      path: `<path d="${barrelPanelPath(a0, a1)}" fill="${shadeFill(fill, facing)}" stroke="${shadeFill(fill, facing)}" stroke-width="0.35"/>`,
      label: sideLabelMarkup(mid0, label, ink, fontSize),
    });
  }
  panels.sort((a, b) => a.facing - b.facing);
  return `${panels.map((p) => p.path).join('')}${panels.map((p) => p.label).join('')}`;
}

function classicFaceWedges(): string {
  const wedge = topWedgePath();
  return WHEEL_SECTORS.map((sector, i) => {
    const { fill, ink } = wedgeFill(i);
    return `<g transform="rotate(${i * STEP_DEG})">
        <path d="${wedge}" fill="${fill}"/>
        ${sectorMark(sector, ink)}
      </g>`;
  }).join('');
}

function superFaceWedges(): string {
  const halfWedge = SUPER_WHEEL_STEP_DEG / 2;
  const wedge = topWedgePathFor(halfWedge);
  const prizes = superWheelPrizes();
  return prizes.map((prize, i) => {
    const { fill, ink } = wedgeFill(i);
    const label = superPrizeLabel(prize);
    const fontSize = superPrizeLabelFontSize(label);
    const midR = RX * 0.58;
    return `<g transform="rotate(${i * SUPER_WHEEL_STEP_DEG})">
        <path d="${wedge}" fill="${fill}"/>
        <text fill="${ink}" font-size="${fontSize}"
          font-family="PT Mono, ui-monospace, monospace" font-weight="700"
          text-anchor="middle" dominant-baseline="middle"
          transform="translate(0 ${(midR).toFixed(1)}) rotate(-90)">${label}</text>
      </g>`;
  }).join('');
}

function rimMetalDefs(): string {
  return `<linearGradient id="rim-metal" gradientUnits="userSpaceOnUse" x1="${-RX}" y1="${-RX * 0.4}" x2="${RX}" y2="${RX * 0.35}">
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
        </linearGradient>`;
}

/** Project a lid-plane point (circular local) onto the foreshortened top face. */
function lidY(y: number): number {
  return y * TOP_SY;
}

/**
 * Rim + arrow + hub in lid-local coords with Y already projected (no scale()).
 * Keeps stroke widths even and the arrow in the same isometric plane as the sectors.
 */
function arrowAndHub(black: string, yellow: string): string {
  const w = ARROW_SHAFT_HALF;
  const tipW = ARROW_TIP;
  // Point toward the viewer: +Y is the near/front rim of the lid.
  const yBase = lidY(-6);
  const yShaft = lidY(ARROW_LEN - ARROW_TIP - 2);
  const yTip = lidY(ARROW_LEN + 4);
  return `<ellipse cx="0" cy="0" rx="${RX + 0.6}" ry="${(RX + 0.6) * TOP_SY}" fill="none" stroke="url(#rim-metal)" stroke-width="1.15"/>
          <g id="wheel-arrow">
            <path d="M ${-w} ${yBase.toFixed(2)}
              L ${w} ${yBase.toFixed(2)}
              L ${w} ${yShaft.toFixed(2)}
              L ${tipW} ${yShaft.toFixed(2)}
              L 0 ${yTip.toFixed(2)}
              L ${-tipW} ${yShaft.toFixed(2)}
              L ${-w} ${yShaft.toFixed(2)}
              Z" fill="url(#arrow-shaft)" stroke="#6a7382" stroke-width="0.5" stroke-linejoin="round"/>
          </g>
          <ellipse cx="0" cy="0" rx="9" ry="${(9 * TOP_SY).toFixed(2)}" fill="${black}"/>
          <ellipse cx="0" cy="0" rx="3.8" ry="${(3.8 * TOP_SY).toFixed(2)}" fill="${yellow}"/>`;
}

/**
 * Top lid only inside #wheel-rot (scale outside so ellipse axes stay screen-
 * aligned while sectors spin). Mantle is a sibling #wheel-barrel in screen
 * space, rebuilt on setAngle.
 */
function wheelDiskInner(barrel: string, face: string, black: string, yellow: string): string {
  return `<ellipse cx="${HUB_X}" cy="${BOT_CY}" rx="${RX}" ry="${RY}" fill="#0d0d0d"/>
        <g id="wheel-barrel">${barrel}</g>
        <g transform="translate(${HUB_X} ${TOP_CY})">
          <g transform="scale(1 ${TOP_SY})">
            <g id="wheel-rot">
              ${face}
            </g>
          </g>
          ${arrowAndHub(black, yellow)}
        </g>`;
}

function pegMarksFor(sectorCount: number, stepDeg: number, halfWedge: number): string {
  return Array.from({ length: sectorCount }, (_, i) => {
    const angle = i * stepDeg - halfWedge;
    return `<g transform="rotate(${angle})">
        <path d="M 0 ${RX} Q 5 ${RX + PEG * 0.65} 0 ${RX + PEG}" fill="none" stroke="url(#peg-stem)" stroke-width="2.1" stroke-linecap="round"/>
        <circle cx="0" cy="${RX + PEG + 1.6}" r="3" fill="url(#peg-knob)" stroke="#8a93a3" stroke-width="0.45"/>
      </g>`;
  }).join('');
}

function pegMarks(): string {
  return pegMarksFor(WHEEL_SECTOR_COUNT, STEP_DEG, HALF_WEDGE);
}

function pegDefs(): string {
  return `<linearGradient id="peg-stem" gradientUnits="userSpaceOnUse" x1="-3" y1="0" x2="3" y2="0">
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
        </radialGradient>`;
}

function pegsInner(marks: string): string {
  return `<g transform="translate(${HUB_X} ${TOP_CY})">
          <g transform="scale(1 ${TOP_SY})">
            <g id="wheel-pegs-rot">${marks}</g>
          </g>
        </g>`;
}

function svgShell(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${inner}
    </svg>`;
}

function classicLabelAt(i: number): SectorLabel {
  const sector = WHEEL_SECTORS[i]!;
  const label = wheelSectorLabel(sector);
  return { label, fontSize: wheelSectorLabelFontSize(label) };
}

function superLabelAt(i: number): SectorLabel {
  const prizes = superWheelPrizes();
  const label = superPrizeLabel(prizes[i]!);
  return { label, fontSize: superPrizeLabelFontSize(label) };
}

export function buildSuperWheelSvg(): string {
  const black = ega(0);
  const yellow = ega(14);
  const halfWedge = SUPER_WHEEL_STEP_DEG / 2;
  const barrel = barrelMarkup(SUPER_WHEEL_SECTOR_COUNT, SUPER_WHEEL_STEP_DEG, halfWedge, 0, superLabelAt);
  return svgShell(`<defs>
${rimMetalDefs()}
      </defs>
      <g>
        ${wheelDiskInner(barrel, superFaceWedges(), black, yellow)}
      </g>`);
}

function buildSuperPegsSvg(): string {
  const halfWedge = SUPER_WHEEL_STEP_DEG / 2;
  return svgShell(`<defs>
${pegDefs()}
      </defs>
      <g>
        ${pegsInner(pegMarksFor(SUPER_WHEEL_SECTOR_COUNT, SUPER_WHEEL_STEP_DEG, halfWedge))}
      </g>`);
}

export function buildWheelSvg(): string {
  const black = ega(0);
  const yellow = ega(14);
  const barrel = barrelMarkup(WHEEL_SECTOR_COUNT, STEP_DEG, HALF_WEDGE, 0, classicLabelAt);
  return svgShell(`<defs>
${rimMetalDefs()}
      </defs>
      <g>
        ${wheelDiskInner(barrel, classicFaceWedges(), black, yellow)}
      </g>`);
}

export function buildPegsSvg(): string {
  return svgShell(`<defs>
${pegDefs()}
      </defs>
      <g>
        ${pegsInner(pegMarks())}
      </g>`);
}

export function mountSvgWheel(diskHost: HTMLElement, pegsHost?: HTMLElement): WheelView {
  let superMode = false;
  let sectorCount = WHEEL_SECTOR_COUNT;
  let stepDeg = STEP_DEG;
  let currentAngle = 0;

  const rebuild = (): void => {
    diskHost.innerHTML = superMode ? buildSuperWheelSvg() : buildWheelSvg();
    if (pegsHost) {
      pegsHost.innerHTML = superMode ? buildSuperPegsSvg() : buildPegsSvg();
    }
    sectorCount = superMode ? SUPER_WHEEL_SECTOR_COUNT : WHEEL_SECTOR_COUNT;
    stepDeg = superMode ? SUPER_WHEEL_STEP_DEG : STEP_DEG;
  };

  rebuild();
  diskHost.hidden = true;
  let rotator = diskHost.querySelector<SVGGElement>('#wheel-rot');
  if (!rotator) {
    throw new Error('SVG wheel rotator missing');
  }
  let barrel = diskHost.querySelector<SVGGElement>('#wheel-barrel');
  if (!barrel) {
    throw new Error('SVG wheel barrel missing');
  }
  let pegsRotator: SVGGElement | null = null;
  if (pegsHost) {
    pegsHost.hidden = true;
    pegsRotator = pegsHost.querySelector<SVGGElement>('#wheel-pegs-rot');
    if (!pegsRotator) {
      throw new Error('SVG wheel pegs rotator missing');
    }
  }

  const refreshRefs = (): void => {
    rotator = diskHost.querySelector<SVGGElement>('#wheel-rot');
    if (!rotator) {
      throw new Error('SVG wheel rotator missing');
    }
    barrel = diskHost.querySelector<SVGGElement>('#wheel-barrel');
    if (!barrel) {
      throw new Error('SVG wheel barrel missing');
    }
    if (pegsHost) {
      pegsRotator = pegsHost.querySelector<SVGGElement>('#wheel-pegs-rot');
    }
  };

  const labelAt = (i: number): SectorLabel => (superMode ? superLabelAt(i) : classicLabelAt(i));

  const rebuildBarrel = (thetaDeg: number): void => {
    if (!barrel) {
      return;
    }
    const halfWedge = stepDeg / 2;
    barrel.innerHTML = barrelMarkup(sectorCount, stepDeg, halfWedge, thetaDeg, labelAt);
  };

  const applyAngle = (degrees: number): void => {
    currentAngle = degrees;
    const rot = `rotate(${degrees})`;
    rotator?.setAttribute('transform', rot);
    pegsRotator?.setAttribute('transform', rot);
    rebuildBarrel(degrees);
  };

  return {
    setFrame(sector: number): void {
      const i = ((sector % sectorCount) + sectorCount) % sectorCount;
      applyAngle(-i * stepDeg);
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
    setSuperMode(enabled: boolean): void {
      if (superMode === enabled) {
        return;
      }
      superMode = enabled;
      rebuild();
      refreshRefs();
      applyAngle(currentAngle);
    },
    getSectorCount(): number {
      return sectorCount;
    },
    getStepDeg(): number {
      return stepDeg;
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
 * top without punching. Punches the elliptical top lid only.
 */
/** Half-width of the soft feather band at the hole edge, in CSS pixels. */
const FEATHER = 2;

function ellipseNorm2(dx: number, dy: number, rx: number, ry: number): number {
  const nx = dx / rx;
  const ny = dy / ry;
  return nx * nx + ny * ny;
}

export function punchWheelHole(rgba: Uint8ClampedArray, keep?: WheelHoleKeep | null): void {
  const outerRx = HOLE_RX + FEATHER;
  const outerRy = HOLE_RY + FEATHER;
  const featherNorm = FEATHER / Math.max(HOLE_RX, HOLE_RY);
  const outerNorm = 1 + featherNorm;
  const innerNorm = Math.max(0, 1 - featherNorm);

  const x0 = Math.max(0, Math.floor(HUB_X - outerRx));
  const x1 = Math.min(SCREEN_W, Math.ceil(HUB_X + outerRx));
  const y0 = Math.max(0, Math.floor(TOP_CY - outerRy));
  const y1 = Math.min(CLIP_Y, Math.ceil(TOP_CY + outerRy));

  for (let y = y0; y < y1; y += 1) {
    const dy = y - TOP_CY;
    for (let x = x0; x < x1; x += 1) {
      const dx = x - HUB_X;
      // 1 on the hole ellipse edge (dx²/rx² + dy²/ry²).
      const n = Math.sqrt(ellipseNorm2(dx, dy, HOLE_RX, HOLE_RY));
      if (n > outerNorm) {
        continue;
      }
      const i = (y * SCREEN_W + x) * 4 + 3;
      if (n <= innerNorm) {
        rgba[i] = 0;
      } else {
        // Feather band: opaque at outerNorm → transparent at innerNorm.
        const t = (outerNorm - n) / Math.max(1e-6, outerNorm - innerNorm);
        rgba[i] = Math.round(rgba[i] * (1 - Math.max(0, Math.min(1, t))));
      }
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
        const dy = y - TOP_CY;
        if (ellipseNorm2(dx, dy, HOLE_RX, HOLE_RY) > 1) {
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

/**
 * Layout anchors for HUD / player clips.
 * `center` = top-lid hub (arrow pivot); elliptical hole punch uses center + holeRadii.
 * `depth` = vertical mantle height CYL_H (not the old shallow rim offset).
 */
export const svgWheelLayout = {
  box: { x: BOX_X, y: BOX_Y, width: BOX_W, height: defaultRenderSpec.wheel.clearRect.height },
  /** Top-face hub (arrow pivot / hole center). */
  center: { x: HUB_X, y: TOP_CY },
  radii: { x: RX, y: RY },
  /** Horizontal hole radius (compat); prefer holeRadii for ellipses. */
  holeR: HOLE_RX,
  holeRadii: { x: HOLE_RX, y: HOLE_RY },
  faceSy: TOP_SY,
  /** Vertical cylinder height (mantle), screen px. */
  depth: CYL_H,
  /** Bottom ellipse center (floor contact ≈ center.y + depth + radii.y). */
  botCenter: { x: HUB_X, y: BOT_CY },
  clipY: CLIP_Y,
  halfStepDeg: STEP_DEG,
};
