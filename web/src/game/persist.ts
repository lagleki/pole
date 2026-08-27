/**
 * Mid-game checkpoint for PWA reloads (DIFF #20). Esc / «Новая игра» still
 * discard the run; only a browser refresh restores this blob.
 */
import type { TopPlayerRecord } from '../assets/pic';

export const PROGRESS_STORAGE_KEY = 'pole-chudes-2:progress';
export const PREFS_STORAGE_KEY = 'pole-chudes-2:prefs';
export const PROGRESS_VERSION = 1 as const;

export interface SeatSave {
  spriteId: number | null;
  nameBytes: number[];
  score: number;
}

export interface CharacterSave {
  spriteId: number;
  name: string;
}

export interface GameProgressSave {
  version: typeof PROGRESS_VERSION;
  /** in-round: resume at the current word/turn. between-rounds: next stage setup. */
  checkpoint: 'in-round' | 'between-rounds';
  rngState: number;
  humanSeats: 1 | 2;
  charId: number;
  characters: CharacterSave[];
  seats: SeatSave[];
  available: number[];
  curSector: number;
  winner: number;
  stage: number;
  curPlayer: number;
  movesForBox: number;
  prevWords: number[];
  guessedWord: number[];
  remaindLetters: number;
  wordPos: number;
  opened: boolean[];
  theme: string;
  topPlayers: TopPlayerRecord[];
}

export interface UiPrefs {
  soundEnabled: boolean;
  humanSeats: 1 | 2;
}

export function isProgressSave(value: unknown): value is GameProgressSave {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as GameProgressSave;
  if (
    v.version !== PROGRESS_VERSION ||
    (v.checkpoint !== 'in-round' && v.checkpoint !== 'between-rounds') ||
    typeof v.rngState !== 'number' ||
    (v.humanSeats !== 1 && v.humanSeats !== 2) ||
    !Array.isArray(v.seats) ||
    v.seats.length !== 3 ||
    !Array.isArray(v.available) ||
    v.available.length !== 32 ||
    !Array.isArray(v.guessedWord) ||
    !Array.isArray(v.opened) ||
    v.opened.length !== v.guessedWord.length ||
    typeof v.stage !== 'number' ||
    v.stage < 0 ||
    v.stage > 7 ||
    typeof v.theme !== 'string' ||
    !Array.isArray(v.topPlayers)
  ) {
    return false;
  }
  if (v.checkpoint === 'in-round' && v.guessedWord.length === 0) {
    return false;
  }
  return true;
}

export function loadProgress(storage: Pick<Storage, 'getItem'> = localStorage): GameProgressSave | null {
  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isProgressSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProgress(save: GameProgressSave, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Private mode / quota — continue without persistence.
  }
}

export function clearProgress(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    storage.removeItem(PROGRESS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadPrefs(storage: Pick<Storage, 'getItem'> = localStorage): Partial<UiPrefs> {
  try {
    const raw = storage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    const v = parsed as Partial<UiPrefs>;
    return {
      soundEnabled: typeof v.soundEnabled === 'boolean' ? v.soundEnabled : undefined,
      humanSeats: v.humanSeats === 1 || v.humanSeats === 2 ? v.humanSeats : undefined,
    };
  } catch {
    return {};
  }
}

export function savePrefs(prefs: UiPrefs, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
