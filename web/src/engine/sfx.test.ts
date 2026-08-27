import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PLAYERS_ENTER_UNDER_HOST, PLAYERS_ENTER_VOLUME, SFX_FILES } from './sfx';

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
