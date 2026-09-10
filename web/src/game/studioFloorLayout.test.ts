import { describe, expect, it } from 'vitest';

import { SCREEN_W, VISIBLE_H } from '../engine/types';
import { defaultRenderSpec } from '../spec';
import {
  FLOOR_BACK_LEFT_X,
  FLOOR_BACK_RIGHT_X,
  FLOOR_BACK_Y,
  FLOOR_COLORS,
  FLOOR_FILL_Y,
  FLOOR_TILE_COLS,
  FLOOR_TILE_ROWS,
  FLOOR_WALL_INSET,
  buildStageBackdropSvg,
  floorDepthT,
  floorPointAt,
  floorTileQuads,
  mountStageBackdrop,
  stageBackdropMarkup,
  stageFloorClipPath,
  stageFloorClipPercents,
  studioFloorCssVars,
  studioFloorQuad,
  studioFloorSvgMarkup,
} from './studioFloorLayout';

describe('studioFloorLayout', () => {
  it('extends the perspective grid to the board wall and past the side edges', () => {
    expect(FLOOR_FILL_Y).toBe(defaultRenderSpec.stage.floorRect.y);
    expect(FLOOR_FILL_Y).toBe(111);
    expect(FLOOR_BACK_Y).toBe(FLOOR_FILL_Y);
    expect(FLOOR_WALL_INSET).toBe(40);
    expect(FLOOR_BACK_LEFT_X).toBeLessThan(FLOOR_WALL_INSET);
    expect(FLOOR_BACK_RIGHT_X).toBeGreaterThan(SCREEN_W - FLOOR_WALL_INSET);

    const q = studioFloorQuad();
    expect(q.topLeft.y).toBe(FLOOR_FILL_Y);
    expect(q.topRight.y).toBe(FLOOR_FILL_Y);
    expect(q.bottomLeft.x).toBeLessThan(0);
    expect(q.bottomRight.x).toBeGreaterThan(SCREEN_W);
    expect(q.bottomLeft.y).toBe(VISIBLE_H);
    expect(q.bottomRight.y).toBe(VISIBLE_H);

    const clip = stageFloorClipPercents();
    expect(clip.topLeft.y).toBe((FLOOR_FILL_Y / VISIBLE_H) * 100);
    expect(clip.bottomRight.y).toBe(100);
    expect(stageFloorClipPath()).toContain('polygon(');
  });

  it('keeps grout clearly darker than tile faces', () => {
    const face = parseInt(FLOOR_COLORS.face.slice(1), 16);
    const alt = parseInt(FLOOR_COLORS.faceAlt.slice(1), 16);
    const grout = parseInt(FLOOR_COLORS.grout.slice(1), 16);
    const lum = (n: number) => ((n >> 16) & 0xff) + ((n >> 8) & 0xff) + (n & 0xff);
    expect(lum(face)).toBeGreaterThan(lum(grout) + 80);
    expect(lum(alt)).toBeGreaterThan(lum(grout) + 40);
    expect(FLOOR_COLORS.grout).toBe('#555555');
  });

  it('maps perspective tile quads inside the floor trapezoid', () => {
    expect(floorDepthT(0)).toBe(0);
    expect(floorDepthT(FLOOR_TILE_ROWS)).toBe(1);
    const mid = floorDepthT(Math.floor(FLOOR_TILE_ROWS / 2));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);

    const q = studioFloorQuad();
    const backMid = floorPointAt(q, 0, 0.5);
    expect(backMid.y).toBe(FLOOR_FILL_Y);
    expect(backMid.x).toBeCloseTo((FLOOR_BACK_LEFT_X + FLOOR_BACK_RIGHT_X) / 2, 5);

    const tiles = floorTileQuads();
    expect(tiles).toHaveLength(FLOOR_TILE_COLS * FLOOR_TILE_ROWS);
    expect(tiles[0]?.points.split(' ')).toHaveLength(4);
    // Checker uses both face colors.
    const fills = new Set(tiles.map((t) => t.fill));
    expect(fills.has(FLOOR_COLORS.face)).toBe(true);
    expect(fills.has(FLOOR_COLORS.faceAlt)).toBe(true);
  });

  it('emits SVG parquet markup with grid id and mounts CSS vars', () => {
    const svg = studioFloorSvgMarkup();
    expect(svg).toContain('class="stage-floor-svg"');
    expect(svg).toContain('id="stage-floor-tiles"');
    expect(svg).toContain('class="stage-floor-tile"');
    expect(svg).toContain(`y="${FLOOR_FILL_Y}"`);
    expect(svg).toContain(FLOOR_COLORS.grout);
    // tile quads + one underlay trapezoid
    expect(svg.match(/<polygon /g)?.length).toBe(FLOOR_TILE_COLS * FLOOR_TILE_ROWS + 1);

    const markup = stageBackdropMarkup();
    expect(markup).toContain('stage-wall-band');
    expect(markup).toContain('stage-floor-tiles');
    expect(markup).toContain('stage-floor-svg');
    expect(buildStageBackdropSvg()).toBe(markup);

    const vars = studioFloorCssVars();
    expect(vars['--stage-tile-grout']).toBe(FLOOR_COLORS.grout);
    expect(vars['--stage-floor-base']).toBe(FLOOR_COLORS.face);

    const setProperty = (key: string, value: string): void => {
      applied[key] = value;
    };
    const applied: Record<string, string> = {};
    const host = {
      style: { setProperty },
      innerHTML: '',
    } as unknown as HTMLElement;
    mountStageBackdrop(host);
    expect(applied['--stage-tile-grout']).toBe(FLOOR_COLORS.grout);
    expect(applied['--stage-floor-base']).toBe(FLOOR_COLORS.face);
    expect(host.innerHTML).toContain('id="stage-floor-tiles"');
    expect(host.innerHTML.match(/class="stage-floor-tile"/g)?.length).toBe(
      FLOOR_TILE_COLS * FLOOR_TILE_ROWS,
    );
    expect(host.innerHTML).toContain('stage-floor-underlay');
  });
});
