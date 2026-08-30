/**
 * SVG Yakubovich overlay (DIFF #19). Base + mouth/eye layers from the original
 * sprites so TTS mouth animation stays over the studio without canvas blits.
 */
import type { PaletteColor } from '../spec/types';
import { SCREEN_W } from '../engine/types';
import { defaultAssetSpec } from '../spec';
import { indexedSpriteToSvg, setSvgShown } from './svgAssist';

export type YakBody = 'passive' | 'active';
export type YakEyes = 'open' | 'close';

export interface YakView {
  loadSprites(
    sprites: readonly { width: number; height: number; pixels: Uint8Array }[],
    palette: readonly PaletteColor[],
  ): void;
  setVisible(visible: boolean): void;
  /** Studio idle: closed mouth, open eyes at the low anchor. */
  showIdle(): void;
  setPose(body: YakBody | null, eyes: YakEyes | null, eyesHigh?: boolean): void;
}

const SPRITE = defaultAssetSpec.spriteIds;

/** dpr: DrawYakubovich* anchors. */
export const YAK_BASE_OFS = 0x1e0 + 0xac * SCREEN_W;
export const YAK_BODY_OFS = 0x1ff + 0xad * SCREEN_W;
export const YAK_EYES_LOW_OFS = 0x214 + 0xd1 * SCREEN_W;
export const YAK_EYES_HIGH_OFS = 0x214 + 0xc9 * SCREEN_W;

const BASE_TC = 7;
const OVERLAY_TC = 16;

function ofsXy(ofs: number): { x: number; y: number } {
  return { x: ofs % SCREEN_W, y: Math.floor(ofs / SCREEN_W) };
}

function buildYakSvg(): string {
  const base = ofsXy(YAK_BASE_OFS);
  const body = ofsXy(YAK_BODY_OFS);
  const eyes = ofsXy(YAK_EYES_LOW_OFS);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g id="yak-root" display="none">
        <g id="yak-base" transform="translate(${base.x} ${base.y})"></g>
        <g id="yak-body" transform="translate(${body.x} ${body.y})">
          <g class="yak-body-frame" data-pose="passive" display="none"></g>
          <g class="yak-body-frame" data-pose="active" display="none"></g>
        </g>
        <g id="yak-eyes" transform="translate(${eyes.x} ${eyes.y})">
          <g class="yak-eyes-frame" data-pose="open" display="none"></g>
          <g class="yak-eyes-frame" data-pose="close" display="none"></g>
        </g>
      </g>
    </svg>`;
}

export function mountSvgYakubovich(host: HTMLElement): YakView {
  host.innerHTML = buildYakSvg();
  host.hidden = true;
  const root = host.querySelector<SVGGElement>('#yak-root');
  const base = host.querySelector<SVGGElement>('#yak-base');
  const eyesGroup = host.querySelector<SVGGElement>('#yak-eyes');
  const bodyFrames = [...host.querySelectorAll<SVGGElement>('.yak-body-frame')];
  const eyesFrames = [...host.querySelectorAll<SVGGElement>('.yak-eyes-frame')];
  if (!root || !base || !eyesGroup) {
    throw new Error('SVG Yakubovich mount failed');
  }

  const eyesLow = ofsXy(YAK_EYES_LOW_OFS);
  const eyesHigh = ofsXy(YAK_EYES_HIGH_OFS);

  return {
    loadSprites(sprites, palette): void {
      const baseSprite = sprites[SPRITE.YAKUBOVICH_BASE];
      if (baseSprite) {
        base.innerHTML = indexedSpriteToSvg(
          baseSprite.pixels,
          baseSprite.width,
          baseSprite.height,
          BASE_TC,
          palette,
        );
      }
      const bodyMap: Record<YakBody, number> = {
        passive: SPRITE.YAKUBOVICH_PASSIVE,
        active: SPRITE.YAKUBOVICH_ACTIVE,
      };
      for (const frame of bodyFrames) {
        const pose = frame.getAttribute('data-pose') as YakBody;
        const sprite = sprites[bodyMap[pose]];
        if (!sprite) {
          continue;
        }
        frame.innerHTML = indexedSpriteToSvg(
          sprite.pixels,
          sprite.width,
          sprite.height,
          OVERLAY_TC,
          palette,
        );
      }
      const eyesMap: Record<YakEyes, number> = {
        open: SPRITE.YAKUBOVICH_EYES_OPEN,
        close: SPRITE.YAKUBOVICH_EYES_CLOSE,
      };
      for (const frame of eyesFrames) {
        const pose = frame.getAttribute('data-pose') as YakEyes;
        const sprite = sprites[eyesMap[pose]];
        if (!sprite) {
          continue;
        }
        frame.innerHTML = indexedSpriteToSvg(
          sprite.pixels,
          sprite.width,
          sprite.height,
          OVERLAY_TC,
          palette,
        );
      }
    },
    setVisible(visible: boolean): void {
      setSvgShown(root, visible);
      host.hidden = !visible;
    },
    showIdle(): void {
      this.setVisible(true);
      this.setPose('passive', 'open', false);
    },
    setPose(body, eyes, eyesHighPos = false): void {
      this.setVisible(true);
      for (const frame of bodyFrames) {
        const pose = frame.getAttribute('data-pose');
        setSvgShown(frame, Boolean(body && pose === body));
      }
      const eyeAnchor = eyesHighPos ? eyesHigh : eyesLow;
      eyesGroup.setAttribute('transform', `translate(${eyeAnchor.x} ${eyeAnchor.y})`);
      for (const frame of eyesFrames) {
        const pose = frame.getAttribute('data-pose');
        setSvgShown(frame, Boolean(eyes && pose === eyes));
      }
    },
  };
}
