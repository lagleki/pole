/**
 * SVG шкатулки overlay (DIFF #19). The three BOX_* sprites rise with a
 * translate instead of a framebuffer screenCopy over the player.
 */
import type { PaletteColor } from '../spec/types';
import { SCREEN_W } from '../engine/types';
import { defaultAssetSpec } from '../spec';
import { indexedSpriteToSvg, setSvgShown } from './svgAssist';

export type BoxKind = 'closed' | 'opened' | 'money';

export interface BoxSprite {
  kind: BoxKind;
  x: number;
  y: number;
}

export interface BoxesView {
  loadSprites(
    sprites: readonly { width: number; height: number; pixels: Uint8Array }[],
    palette: readonly PaletteColor[],
  ): void;
  setVisible(visible: boolean): void;
  show(items: readonly BoxSprite[]): void;
}

const SPRITE = defaultAssetSpec.spriteIds;
/** drawSprite(..., 7): floor gray is transparent. */
export const BOX_TRANSPARENT = 7;
export const BOX_BRING_IN_FRAMES = 31;

const KIND_SPRITE: Record<BoxKind, number> = {
  closed: SPRITE.BOX_CLOSED,
  opened: SPRITE.BOX_OPENED,
  money: SPRITE.BOX_MONEY,
};

export function boxOfsXy(ofs: number): { x: number; y: number } {
  return { x: ofs % SCREEN_W, y: Math.floor(ofs / SCREEN_W) };
}

/** frame 0 = start below the seat, frame 30 = landed (dpr:1133-1148). */
export function boxBringIn(talkBubbleOfs: number, frame: number): BoxSprite[] {
  const clamped = Math.max(0, Math.min(BOX_BRING_IN_FRAMES - 1, frame));
  const j = talkBubbleOfs + (60 - 2 * clamped) * SCREEN_W;
  return [
    { kind: 'opened', ...boxOfsXy(j - 46 * SCREEN_W - 32) },
    { kind: 'opened', ...boxOfsXy(j - 46 * SCREEN_W + 24) },
    { kind: 'money', ...boxOfsXy(j - 60 * SCREEN_W + 26) },
  ];
}

export function boxClosedPair(talkBubbleOfs: number, shuffled: boolean): BoxSprite[] {
  if (!shuffled) {
    return [
      { kind: 'closed', ...boxOfsXy(talkBubbleOfs - 41 * SCREEN_W - 32) },
      { kind: 'closed', ...boxOfsXy(talkBubbleOfs - 41 * SCREEN_W + 24) },
    ];
  }
  return [
    { kind: 'closed', ...boxOfsXy(talkBubbleOfs - 36 * SCREEN_W - 6) },
    { kind: 'closed', ...boxOfsXy(talkBubbleOfs - 46 * SCREEN_W + 4) },
  ];
}

export function boxReveal(talkBubbleOfs: number, moneyOnRight: boolean): BoxSprite[] {
  return [
    { kind: 'opened', ...boxOfsXy(talkBubbleOfs - 46 * SCREEN_W - 32) },
    { kind: 'opened', ...boxOfsXy(talkBubbleOfs - 46 * SCREEN_W + 24) },
    { kind: 'money', ...boxOfsXy(talkBubbleOfs - 60 * SCREEN_W - 30 + (moneyOnRight ? 56 : 0)) },
  ];
}

function buildBoxesSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <g id="box-art-closed"></g>
        <g id="box-art-opened"></g>
        <g id="box-art-money"></g>
      </defs>
      <g id="boxes-root" display="none"></g>
    </svg>`;
}

export function mountSvgBoxes(host: HTMLElement): BoxesView {
  host.innerHTML = buildBoxesSvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#boxes-root');
  const closed = host.querySelector<SVGGElement>('#box-art-closed');
  const opened = host.querySelector<SVGGElement>('#box-art-opened');
  const money = host.querySelector<SVGGElement>('#box-art-money');
  if (!root || !closed || !opened || !money) {
    throw new Error('SVG boxes mount failed');
  }
  const arts: Record<BoxKind, SVGGElement> = { closed, opened, money };

  return {
    loadSprites(sprites, palette): void {
      (Object.keys(KIND_SPRITE) as BoxKind[]).forEach((kind) => {
        const sprite = sprites[KIND_SPRITE[kind]];
        const art = arts[kind];
        if (!sprite || !art) {
          return;
        }
        art.innerHTML = indexedSpriteToSvg(
          sprite.pixels,
          sprite.width,
          sprite.height,
          BOX_TRANSPARENT,
          palette,
        );
      });
    },
    setVisible(visible: boolean): void {
      setSvgShown(root, visible);
      host.hidden = !visible;
      if (!visible) {
        root.innerHTML = '';
      }
    },
    show(items: readonly BoxSprite[]): void {
      root.innerHTML = items
        .map(
          (item) =>
            `<g transform="translate(${item.x} ${item.y})"><use href="#box-art-${item.kind}"/></g>`,
        )
        .join('');
      setSvgShown(root, true);
      host.hidden = false;
    },
  };
}
