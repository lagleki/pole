import { describe, expect, it } from 'vitest';

import { CHARACTERS, DECISION_ANIM, liveSeat } from './constants';
import {
  PLAYER_ART_IDS,
  PLAYER_TRANSPARENT,
  buildPlayersSvg,
  playerXY,
} from './svgPlayers';
import { svgWheelLayout } from './svgWheel';

describe('svg players', () => {
  it('maps linear ofs to screen coordinates', () => {
    const ofs = liveSeat(0).spriteOfs;
    expect(playerXY(ofs)).toEqual({
      x: ofs % 640,
      y: Math.floor(ofs / 640),
    });
  });

  it('loads lean poses and the NPC roster into defs', () => {
    expect(PLAYER_ART_IDS).toEqual(
      expect.arrayContaining([...DECISION_ANIM, ...CHARACTERS.map((c) => c.spriteId)]),
    );
    expect(new Set(PLAYER_ART_IDS).size).toBe(PLAYER_ART_IDS.length);
    expect(PLAYER_TRANSPARENT).toBe(2);
  });

  it('emits three seats clipped under the drum hole', () => {
    const svg = buildPlayersSvg();
    expect(svg).toContain('id="players-root"');
    expect(svg).toContain('id="players-under-drum"');
    expect(svg).toContain('id="player-seat-clip"');
    expect(svg).toContain('clip-path="url(#players-under-drum)"');
    expect(svg).toContain('data-seat="0"');
    expect(svg).toContain('data-seat="2"');
    expect(svg).toContain(`id="player-art-${DECISION_ANIM[2]}"`);
    expect(svg).toContain(`m ${-svgWheelLayout.holeR},0`);
    for (const id of DECISION_ANIM) {
      expect(svg).toContain(`id="player-art-${id}"`);
    }
  });
});
