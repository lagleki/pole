import { describe, expect, it } from 'vitest';

import {
  ASSIST_WALK_Y,
  ASSIST_WING_X,
  BACK_WALL_H,
  BACK_WALL_Y,
  BRICK_COLS,
  BRICK_COUNT,
  BRICK_ORIGIN_X,
  BRICK_ORIGIN_Y,
  BRICK_STRIDE_X,
  BRICK_STRIDE_Y,
  BRICK_W,
  LAMP_H,
  LAMP_POS,
  LAMP_W,
  STUDIO_UPPER_H,
  WALL_BOT,
  WALL_H,
  WALL_W,
  WALL_Y,
  backWallRect,
  brickUsesMarkup,
  brickXY,
  buildStudioLightSvg,
  buildStudioSvg,
  lampBulbs,
  lampIrradiance,
  leftWallPoly,
  punchStudioHoles,
  restoredBrickKinds,
  rightWallPoly,
  studioPunchRects,
  wallRect,
} from './svgStudio';

describe('svg studio', () => {
  it('places 36 bricks on the DOS 12×3 grid', () => {
    expect(brickXY(0)).toEqual({ x: BRICK_ORIGIN_X, y: BRICK_ORIGIN_Y });
    expect(brickXY(11)).toEqual({
      x: BRICK_ORIGIN_X + 11 * BRICK_STRIDE_X,
      y: BRICK_ORIGIN_Y,
    });
    expect(brickXY(12)).toEqual({
      x: BRICK_ORIGIN_X,
      y: BRICK_ORIGIN_Y + BRICK_STRIDE_Y,
    });
    expect(brickXY(35).x + BRICK_W).toBeLessThanOrEqual(640);
    expect(restoredBrickKinds()).toHaveLength(BRICK_COUNT);
    expect(restoredBrickKinds()).toEqual(
      Array.from({ length: BRICK_COUNT }, (_, i) => i % 3),
    );
    expect(BRICK_COLS).toBe(12);
  });

  it('emits geometric bricks, lamps and rectangular side walls', () => {
    const svg = buildStudioSvg();
    expect(svg).toContain('id="studio-root"');
    expect(svg).toContain('id="studio-brick-0"');
    expect(svg).toContain('id="studio-wall-left"');
    expect(svg).toContain('id="studio-wall-right"');
    expect(svg).not.toContain('id="studio-wing-left"');
    expect(svg).toContain('url(#wall-stone)');
    expect(svg).toContain('url(#brick-blob)');
    expect(svg).toContain('id="studio-swirls"');
    expect(svg).toContain('#ffe0c0');
    expect(svg).toContain('#6a9ee0');
    expect(svg).not.toContain('wall-lamp-shade');
    expect(svg).not.toContain('wall-lamp-falloff');
    expect(svg).toContain(`translate(${LAMP_POS[0].x} ${LAMP_POS[0].y})`);
    expect(svg).toContain(`translate(${LAMP_POS[1].x} ${LAMP_POS[1].y})`);
    expect(LAMP_W).toBe(16);
    expect(LAMP_H).toBe(15);
    expect(WALL_W).toBe(40);
    expect(WALL_H).toBe(139);
    expect(WALL_Y).toBe(25);
  });

  it('spans the back wall across the full screen width', () => {
    const back = backWallRect();
    expect(back).toEqual({ x: 0, y: BACK_WALL_Y, w: 640, h: BACK_WALL_H });
    expect(ASSIST_WING_X).toBe(WALL_W);
    expect(ASSIST_WALK_Y).toBe(WALL_Y);
    expect(ASSIST_WALK_Y).toBeGreaterThan(back.y);
    expect(ASSIST_WALK_Y).toBeLessThan(back.y + back.h);
    const left = leftWallPoly();
    const right = rightWallPoly();
    expect(left).toEqual([
      { x: 0, y: WALL_Y },
      { x: WALL_W, y: WALL_Y },
      { x: WALL_W, y: WALL_BOT },
      { x: 0, y: WALL_BOT },
    ]);
    expect(right[0].x).toBe(640 - WALL_W);
    expect(Math.max(...left.map((p) => p.x))).toBe(WALL_W);
    expect(Math.max(...left.map((p) => p.y))).toBe(WALL_BOT);
  });

  it('models soft lamp falloff and emits a diffuse light overlay', () => {
    const bulbs = lampBulbs();
    expect(bulbs).toHaveLength(2);
    expect(bulbs[0]).toEqual({ x: LAMP_POS[0].x + 8, y: LAMP_POS[0].y + 10.5 });
    const near = lampIrradiance(bulbs[0].x, bulbs[0].y);
    const far = lampIrradiance(320, 300);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(1);
    const light = buildStudioLightSvg();
    expect(light).toContain('id="studio-light-root"');
    expect(light).toContain('class="lamp-fill"');
    expect(light).toContain('class="lamp-floor"');
    expect(light).toContain('url(#lamp-bounce)');
    expect(light).toContain('url(#lamp-fill-0)');
    expect(light).toContain('url(#lamp-floor-1)');
  });

  it('writes one <use> per brick kind', () => {
    const kinds = restoredBrickKinds();
    const markup = brickUsesMarkup(kinds);
    expect(markup.match(/<use /g)?.length).toBe(BRICK_COUNT);
    expect(markup).toContain('#studio-brick-0');
    expect(markup).toContain('#studio-brick-1');
    expect(markup).toContain('#studio-brick-2');
  });

  it('punches the upper studio and the side-wall rectangles', () => {
    expect(studioPunchRects()).toEqual([
      { x: 0, y: 0, w: 640, h: STUDIO_UPPER_H },
      wallRect('left'),
      wallRect('right'),
    ]);
    const rgba = new Uint8ClampedArray(640 * 350 * 4);
    rgba.fill(255);
    punchStudioHoles(rgba);
    expect(rgba[3]).toBe(0);
    const nearWall = (150 * 640 + 10) * 4 + 3;
    expect(rgba[nearWall]).toBe(0);
    const midFloor = (220 * 640 + 320) * 4 + 3;
    expect(rgba[midFloor]).toBe(255);
  });
});
