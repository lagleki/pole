import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PLAYERS_ENTER_UNDER_HOST, PLAYERS_ENTER_VOLUME, SFX_FILES, isMusicSfx } from './sfx';

const sfxDir = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/sfx');

describe('SFX_FILES', () => {
  it('points at mp3 files on disk', () => {
    for (const file of Object.values(SFX_FILES)) {
      expect(existsSync(join(sfxDir, file)), file).toBe(true);
    }
  });
});

describe('players-enter bed', () => {
  it('stays under host TTS', () => {
    expect(PLAYERS_ENTER_VOLUME).toBeLessThan(0.35);
    expect(PLAYERS_ENTER_UNDER_HOST).toBeLessThan(PLAYERS_ENTER_VOLUME);
    expect(PLAYERS_ENTER_UNDER_HOST).toBeGreaterThan(0);
  });
});

describe('music vs sfx', () => {
  it('gates beds, drum, sector/letter/word/box cues by Музыка', () => {
    expect(isMusicSfx('playersEnter')).toBe(true);
    expect(isMusicSfx('opening')).toBe(true);
    expect(isMusicSfx('super60s')).toBe(true);
    expect(isMusicSfx('drumSpin')).toBe(true);
    expect(isMusicSfx('sting')).toBe(true);
    expect(isMusicSfx('bankrupt')).toBe(true);
    expect(isMusicSfx('sectorPlus')).toBe(true);
    expect(isMusicSfx('letterCorrect')).toBe(true);
    expect(isMusicSfx('letterWrong')).toBe(true);
    expect(isMusicSfx('wordWrong')).toBe(true);
    expect(isMusicSfx('boxMoney')).toBe(true);
    expect(isMusicSfx('boxEmpty')).toBe(true);
  });
});

describe('winnerTour vs wordCorrect', () => {
  it('shares the same victory sting file (round-end must not double-play it)', () => {
    expect(SFX_FILES.winnerTour).toBe(SFX_FILES.wordCorrect);
  });
});
