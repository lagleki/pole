import { describe, expect, it } from 'vitest';

import { BOARD_OUTER } from './svgBoard';
import {
  ASSIST_WALK_Y,
  ASSIST_WING_X,
  BACK_JAMB,
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
  buildStudioSvg,
  leftWallPoly,
  punchStudioHoles,
  restoredBrickKinds,
  rightWallPoly,
  studioPunchRects,
  wallRect,
  wingGap,
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
    expect(svg).toContain('id="studio-wing-left"');
    expect(svg).toContain('url(#wall-stone)');
    expect(svg).toContain('#5555ff');
    expect(svg).toContain('#00aaaa');
    expect(svg).toContain('#0000aa');
    expect(svg).toContain(`translate(${LAMP_POS[0].x} ${LAMP_POS[0].y})`);
    expect(svg).toContain(`translate(${LAMP_POS[1].x} ${LAMP_POS[1].y})`);
    expect(LAMP_W).toBe(16);
    expect(LAMP_H).toBe(15);
    expect(WALL_W).toBe(40);
    expect(WALL_H).toBe(139);
    expect(WALL_Y).toBe(25);
  });

  it('leaves a wing gap between each side wall and the board wall', () => {
    const gap = wingGap();
    const back = backWallRect();
    expect(gap.left.x0).toBe(ASSIST_WING_X);
    expect(gap.left.x0).toBe(WALL_W);
    expect(gap.left.x1).toBe(back.x);
    expect(gap.left.x1).toBe(BOARD_OUTER.x - BACK_JAMB);
    expect(gap.left.x1 - gap.left.x0).toBeGreaterThan(25);
    expect(gap.right.x0).toBe(back.x + back.w);
    expect(gap.right.x1 - gap.right.x0).toBe(gap.left.x1 - gap.left.x0);
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
