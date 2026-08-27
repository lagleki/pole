import { describe, expect, it } from 'vitest';

import {
  clearProgress,
  isProgressSave,
  loadPrefs,
  loadProgress,
  PREFS_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  savePrefs,
  saveProgress,
  type GameProgressSave,
} from './persist';
import { buildPegsSvg, buildWheelSvg, punchWheelHole, svgWheelLayout } from './svgWheel';
import { WHEEL_SECTOR_COUNT, WHEEL_SECTORS, wheelSectorLabel } from './tvWheel';

function sampleSave(overrides: Partial<GameProgressSave> = {}): GameProgressSave {
  return {
    version: 1,
    checkpoint: 'in-round',
    rngState: 42,
    humanSeats: 1,
    charId: 2,
    characters: [{ spriteId: 51, name: 'КРОЛИК' }],
    seats: [
      { spriteId: 17, nameBytes: [0x88, 0x83, 0x90, 0x8e, 0x8a], score: 15 },
      { spriteId: 51, nameBytes: [1, 2], score: 0 },
      { spriteId: null, nameBytes: [], score: 5 },
    ],
    available: Array.from({ length: 32 }, (_, i) => (i === 0 ? 0x20 : 0x80 + i)),
    curSector: 6,
    winner: 3,
    stage: 1,
    curPlayer: 0,
    movesForBox: 1,
    prevWords: [3, -1, -1, -1, -1, -1, -1, -1],
    guessedWord: [0x8c, 0x80, 0x8a],
    remaindLetters: 2,
    wordPos: 121,
    opened: [true, false, false],
    theme: 'ТЕМА',
    topPlayers: [{ name: 'ТЕСТ', score: 10 }],
    ...overrides,
  };
}

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe('svg wheel', () => {
  it('emits the 36-sector TV drum (DIFF #26)', () => {
    expect(WHEEL_SECTORS).toHaveLength(WHEEL_SECTOR_COUNT);
    expect(WHEEL_SECTORS.some((s) => s.kind === 'prize')).toBe(true);
    const svg = buildWheelSvg();
    expect(svg).toContain('id="wheel-rot"');
    expect(svg).toContain('>П</text>');
    expect(svg).toContain('>Б</text>');
    expect(svg).toContain('>1000</text>');
    expect(svg).not.toContain('ПРИЗ');
    expect(svgWheelLayout.box).toEqual({ x: 128, y: 154, width: 223, height: 172 });
    expect(svgWheelLayout.center.x).toBe(128 + 223 / 2);
    expect(svgWheelLayout.center.y).toBeGreaterThan(280);
    expect(svgWheelLayout.radii.x).toBeGreaterThan(120);
    expect(svgWheelLayout.radii.x).toBe(svgWheelLayout.radii.y);
    expect(svg).toContain('id="wheel-letter-clip"');
    expect(svg).toContain('viewBox="0 0 640 350"');
    expect(svgWheelLayout.halfStepDeg).toBe(10);
    expect(svgWheelLayout.clipY).toBe(0x14c);
    expect(buildPegsSvg()).toContain('id="wheel-pegs-rot"');
    expect(svgWheelLayout.holeR).toBeLessThan(svgWheelLayout.radii.x + 4);
  });

  it('punches a circular hole down to the alphabet row and keeps the hand', () => {
    const rgba = new Uint8ClampedArray(640 * 350 * 4);
    rgba.fill(255);
    const keep = {
      ofs: 0x13a * 640 + 240,
      width: 2,
      height: 2,
      pixels: new Uint8Array([1, 2, 1, 1]),
      transparent: 2,
    };
    punchWheelHole(rgba, keep);
    const hub = svgWheelLayout.center;
    const hubI = (Math.floor(hub.y) * 640 + Math.floor(hub.x)) * 4 + 3;
    expect(rgba[hubI]).toBe(0);
    const letterRow = (0x14c * 640 + Math.floor(hub.x)) * 4 + 3;
    expect(rgba[letterRow]).toBe(255);
    const handOpaque = (0x13a * 640 + 240) * 4 + 3;
    expect(rgba[handOpaque]).toBe(255);
    const handTransparent = (0x13a * 640 + 241) * 4 + 3;
    expect(rgba[handTransparent]).toBe(0);
    const outsideDisk = (Math.floor(hub.y) * 640 + Math.floor(hub.x + svgWheelLayout.radii.x + 8)) * 4 + 3;
    expect(rgba[outsideDisk]).toBe(255);
  });
});

describe('progress persistence', () => {
  it('round-trips a checkpoint through storage', () => {
    const storage = new MemoryStorage();
    const save = sampleSave();
    saveProgress(save, storage);
    expect(storage.getItem(PROGRESS_STORAGE_KEY)).toContain('"theme":"ТЕМА"');
    expect(loadProgress(storage)).toEqual(save);
    clearProgress(storage);
    expect(loadProgress(storage)).toBeNull();
  });

  it('rejects a blob with no word in progress', () => {
    expect(isProgressSave(sampleSave({ guessedWord: [], opened: [] }))).toBe(false);
    expect(isProgressSave(sampleSave({ checkpoint: 'between-rounds', guessedWord: [], opened: [] }))).toBe(true);
    expect(isProgressSave({ version: 1 })).toBe(false);
  });

  it('stores sound and player-mode prefs separately', () => {
    const storage = new MemoryStorage();
    savePrefs({ soundEnabled: true, humanSeats: 2 }, storage);
    expect(JSON.parse(storage.getItem(PREFS_STORAGE_KEY) ?? '{}')).toEqual({
      soundEnabled: true,
      humanSeats: 2,
    });
    expect(loadPrefs(storage)).toEqual({ soundEnabled: true, humanSeats: 2 });
  });
});
