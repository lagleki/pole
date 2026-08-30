import { describe, expect, it } from 'vitest';

import {
  BOARD_FRAME,
  BOARD_OUTER,
  boardPunchRects,
  buildBoardSvg,
  buildStageRowMarkup,
  GRID_COLS,
  GRID_COL_W,
  GRID_ROW_H,
  GRID_ROWS,
  punchOverlayHoles,
  stageTileX,
  stageTileY,
  wordPosForLength,
  wordTileX,
  wordTileY,
} from './svgBoard';
import { STAGE_NAMES } from './constants';

describe('svg board', () => {
  it('emits stage banner and word tiles', () => {
    const svg = buildBoardSvg();
    expect(svg).toContain('id="board-panel"');
    expect(svg).toContain('id="board-bezel"');
    expect(svg).toContain('id="board-bezel-lip"');
    expect(svg).toContain('url(#marble-base)');
    expect(svg).toContain('id="board-grid"');
    expect(svg).toContain('id="stage-row"');
    expect(svg).toContain('id="word-row"');
    expect(svg).toContain('url(#word-face)');
    expect(svg).toContain('class="word-lift"');
    expect(svg).not.toContain('board-scores');
    expect(svg).toContain('class="word-tile"');
    expect(svg).toContain('viewBox="0 0 640 350"');
  });

  it('emits a 25×4 marble grid with black strokes', () => {
    const svg = buildBoardSvg();
    expect(svg).toContain('id="board-grid"');
    expect(svg.match(/id="board-grid"[\s\S]*?<\/g>/)?.[0]?.match(/<rect/g)?.length).toBe(
      GRID_COLS * GRID_ROWS,
    );
    expect(svg).toContain(`width="${GRID_COL_W}" height="${GRID_ROW_H}"`);
  });

  it('places each stage-name character in its own grid cell', () => {
    const name = STAGE_NAMES[3];
    const markup = buildStageRowMarkup(name);
    expect(markup.match(/class="stage-cell"/g)?.length).toBe([...name].length);
    expect(stageTileY()).toBe(BOARD_FRAME.y + GRID_ROW_H * 3);
    const len = [...name].length;
    for (let i = 0; i < len; i += 1) {
      const x = stageTileX(i, len);
      expect((x - BOARD_FRAME.x) % GRID_COL_W).toBe(0);
    }
    expect(markup).toContain('>8<');
    expect(markup).toContain('>/<');
  });

  it('aligns word tiles to grid columns and the word row', () => {
    const len = 6;
    const pos = wordPosForLength(len);
    expect(wordTileY()).toBe(BOARD_FRAME.y + GRID_ROW_H);
    for (let i = 0; i < len; i += 1) {
      const x = wordTileX(pos, i);
      expect((x - BOARD_FRAME.x) % GRID_COL_W).toBe(0);
      expect(x).toBeGreaterThanOrEqual(BOARD_FRAME.x);
      expect(x + GRID_COL_W).toBeLessThanOrEqual(BOARD_FRAME.x + BOARD_FRAME.w);
    }
  });

  it('lists a single punch rect for the board panel and bezel', () => {
    const rects = boardPunchRects();
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ x: BOARD_OUTER.x, y: BOARD_OUTER.y, w: BOARD_OUTER.w, h: BOARD_OUTER.h });
  });

  it('punches board bands transparent on the canvas RGBA buffer', () => {
    const rgba = new Uint8ClampedArray(640 * 350 * 4);
    rgba.fill(255);
    punchOverlayHoles(rgba);
    const framePx = (BOARD_OUTER.y * 640 + BOARD_OUTER.x) * 4 + 3;
    expect(rgba[framePx]).toBe(0);
    expect(boardPunchRects()).toHaveLength(1);
  });
});
