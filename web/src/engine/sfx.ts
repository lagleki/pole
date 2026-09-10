/**
 * TV-show SFX pack (DIFF #25) — samples from
 * https://zvukipro.com/teleshow/281-zvuki-iz-teleperedachi-pole-chudes.html
 * PWM beeps still run for delay/RNG parity; the browser plays these instead.
 */

export const SFX_DIR = 'assets/sfx';

/** Logical cue → filename under `public/assets/sfx/`. */
export const SFX_FILES = {
  letterCorrect: 'letter-correct.mp3',
  letterWrong: 'letter-wrong.mp3',
  wordCorrect: 'word-correct.mp3',
  wordWrong: 'word-wrong-tour.mp3',
  wordWrongSuper: 'word-wrong-super.mp3',
  drumSpin: 'drum-1995.mp3',
  opening: 'opening-new.mp3',
  openingOld: 'opening-old.mp3',
  commercial: 'commercial.mp3',
  playersEnter: 'players-enter.mp3',
  fanfare: 'fanfare.mp3',
  superGame: 'super-game.mp3',
  super60s: 'super-60s.mp3',
  sectorPrize: 'sector-prize.mp3',
  bankrupt: 'bankrupt-2000.mp3',
  sectorZero: 'sector-zero.mp3',
  sectorPlus: 'sector-plus.mp3',
  sectorX2: 'sector-x2.mp3',
  boxEmpty: 'box-empty.mp3',
  boxMoney: 'box-money.mp3',
  prizesStudio: 'fanfare.mp3',
  winnerTour: 'word-correct.mp3',
  sting: 'sting.mp3',
  sponsor: 'sponsor.mp3',
  autoWin: 'auto-win.mp3',
  automobileYell: 'automobile-yell.mp3',
  vseVashe: 'vse-vashe.mp3',
} as const;

export type SfxId = keyof typeof SFX_FILES;

/**
 * All gameplay SFX beds, stings, sector jingles, letter/word/box cues — gated by
 * Музыка (volume 0 vs base). Ctrl+S still gates host TTS only.
 */
export const MUSIC_SFX_IDS = [
  'opening',
  'openingOld',
  'commercial',
  'playersEnter',
  'fanfare',
  'superGame',
  'super60s',
  'prizesStudio',
  'sponsor',
  'drumSpin',
  'sting',
  'sectorPrize',
  'bankrupt',
  'sectorZero',
  'sectorPlus',
  'sectorX2',
  'autoWin',
  'automobileYell',
  'vseVashe',
  'winnerTour',
  'letterCorrect',
  'letterWrong',
  'wordCorrect',
  'wordWrong',
  'wordWrongSuper',
  'boxEmpty',
  'boxMoney',
] as const satisfies readonly SfxId[];

const MUSIC_SFX = new Set<SfxId>(MUSIC_SFX_IDS);

export function isMusicSfx(id: SfxId): boolean {
  return MUSIC_SFX.has(id);
}

export interface SfxPlayOptions {
  /** Restart if already playing. Default true. */
  restart?: boolean;
  /** Loop until stop(). */
  loop?: boolean;
  /** 0..1, default 1. */
  volume?: number;
}

/** Underscore under player intros — loud enough to hear, not over TTS. */
export const PLAYERS_ENTER_VOLUME = 0.2;
/** Under the host’s tour prompt. */
export const PLAYERS_ENTER_UNDER_HOST = 0.05;

export interface SfxTrackState {
  primed: boolean;
  pending: boolean;
  paused: boolean;
  currentTime: number;
  volume: number;
}

export interface GameSfx {
  play(id: SfxId, options?: SfxPlayOptions): void;
  stop(id?: SfxId): void;
  setVolume(id: SfxId, volume: number): void;
  /**
   * Apply Музыка ВКЛ/ВЫКЛ as volume 0 vs restored base volumes.
   * Does not pause or rewind beds — they keep playing silently until unmuted.
   */
  syncMusicVolumes(): void;
  /** Stop looping beds without killing letter/drum cues. */
  stopMusic(): void;
  /** Unlock HTMLAudio on a user gesture. Safe to call again; does not pause playing cues. */
  prime(): Promise<void>;
  /** Create `<audio>` nodes and start loading mp3 before the first gesture. */
  warmup(): void;
  /** Replay cues that failed to start after the last unlock gesture. */
  retryPending(): void;
  /** Primed by a user gesture (`prime()` completed). */
  isPrimed(): boolean;
  /** Track snapshot for smoke / resume-audio e2e. */
  getTrackState(id: SfxId): SfxTrackState;
}

function isWebDriver(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.webdriver);
}

function testAudioEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return new URLSearchParams(window.location.search).has('testAudio');
}

function audioPlaybackAllowed(): boolean {
  return !isWebDriver() || testAudioEnabled();
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }
  return Math.min(1, Math.max(0, volume));
}

function sfxUrl(file: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}${SFX_DIR}/${file}`;
}

/** One-shot unlock; playing every mp3 at once aborts the long beds (players-enter, super-60s). */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

/**
 * HTMLAudio playback. Skipped when muted, in Node, or under Playwright
 * (`navigator.webdriver`), matching host TTS.
 */
const SFX_IDS = Object.keys(SFX_FILES) as SfxId[];

export function createGameSfx(options: { getEnabled: () => boolean; getMusicEnabled: () => boolean }): GameSfx {
  const players = new Map<SfxId, HTMLAudioElement>();
  const pending = new Map<SfxId, SfxPlayOptions>();
  /** Last requested volume per music cue (before Музыка mute). */
  const musicBaseVolume = new Map<SfxId, number>();
  let primed = false;
  let priming: Promise<void> | null = null;
  let gestureRetryHook: (() => void) | null = null;

  const scheduleGestureRetry = (): void => {
    if (gestureRetryHook || typeof document === 'undefined') {
      return;
    }
    gestureRetryHook = (): void => {
      gestureRetryHook = null;
      flushPending();
    };
    document.addEventListener('pointerdown', gestureRetryHook, { once: true });
  };

  const element = (id: SfxId): HTMLAudioElement | null => {
    if (typeof Audio === 'undefined') {
      return null;
    }
    let player = players.get(id);
    if (!player) {
      player = new Audio(sfxUrl(SFX_FILES[id]));
      player.preload = 'auto';
      player.setAttribute('playsinline', '');
      players.set(id, player);
    }
    return player;
  };

  const audibleVolume = (id: SfxId, base: number): number => {
    const clamped = clampVolume(base);
    if (isMusicSfx(id) && !options.getMusicEnabled()) {
      return 0;
    }
    return clamped;
  };

  const applyMusicPlayerVolume = (id: SfxId, player: HTMLAudioElement): void => {
    const base = musicBaseVolume.get(id) ?? player.volume;
    player.volume = audibleVolume(id, base);
  };

  const start = (id: SfxId, playOptions: SfxPlayOptions): void => {
    const player = element(id);
    if (!player) {
      return;
    }
    const restart = playOptions.restart !== false;
    const base = clampVolume(playOptions.volume ?? 1);
    player.loop = Boolean(playOptions.loop);
    if (isMusicSfx(id)) {
      musicBaseVolume.set(id, base);
    }
    player.volume = audibleVolume(id, base);
    player.muted = false;
    if (restart) {
      try {
        player.currentTime = 0;
      } catch {
        /* empty */
      }
    }
    const p = player.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        pending.set(id, playOptions);
        scheduleGestureRetry();
      });
    }
  };

  const cueAllowed = (id: SfxId): boolean => {
    if (!audioPlaybackAllowed()) {
      return false;
    }
    // Music cues always start; Музыка: ВЫКЛ only zeros their volume.
    return isMusicSfx(id) ? true : options.getEnabled();
  };

  const flushPending = (): void => {
    const queued = [...pending.entries()];
    pending.clear();
    for (const [id, playOptions] of queued) {
      if (cueAllowed(id)) {
        start(id, playOptions);
      }
    }
  };

  return {
    warmup(): void {
      if (typeof Audio === 'undefined') {
        return;
      }
      for (const id of SFX_IDS) {
        element(id)?.load();
      }
    },

    prime(): Promise<void> {
      if (primed) {
        return Promise.resolve();
      }
      if (priming) {
        return priming;
      }
      if (typeof Audio === 'undefined' || (isWebDriver() && !testAudioEnabled())) {
        primed = true;
        return Promise.resolve();
      }
      const unlock = new Audio(SILENT_WAV);
      unlock.muted = true;
      const started = unlock.play();
      priming = (started && typeof started.then === 'function' ? started : Promise.resolve())
        .then(() => {
          unlock.pause();
        })
        .catch(() => {
          /* gesture may still unlock the document */
        })
        .then(() => {
          primed = true;
          priming = null;
          flushPending();
        });
      return priming;
    },

    retryPending(): void {
      flushPending();
    },

    isPrimed(): boolean {
      return primed;
    },

    getTrackState(id: SfxId): SfxTrackState {
      const player = players.get(id);
      return {
        primed,
        pending: pending.has(id),
        paused: player ? player.paused : true,
        currentTime: player?.currentTime ?? 0,
        volume: player?.volume ?? 0,
      };
    },

    play(id: SfxId, playOptions: SfxPlayOptions = {}): void {
      if (!cueAllowed(id)) {
        return;
      }
      if (!primed) {
        pending.set(id, playOptions);
        return;
      }
      pending.delete(id);
      start(id, playOptions);
    },

    setVolume(id: SfxId, volume: number): void {
      const base = clampVolume(volume);
      if (isMusicSfx(id)) {
        musicBaseVolume.set(id, base);
      }
      const player = players.get(id);
      if (player) {
        player.volume = audibleVolume(id, base);
      }
    },

    syncMusicVolumes(): void {
      for (const id of MUSIC_SFX_IDS) {
        const player = players.get(id);
        if (player) {
          applyMusicPlayerVolume(id, player);
        }
      }
    },

    stopMusic(): void {
      for (const id of MUSIC_SFX_IDS) {
        pending.delete(id);
        const player = players.get(id);
        if (player) {
          player.loop = false;
          player.pause();
          try {
            player.currentTime = 0;
          } catch {
            /* empty */
          }
        }
      }
    },

    stop(id?: SfxId): void {
      const stopOne = (player: HTMLAudioElement): void => {
        player.loop = false;
        player.pause();
        try {
          player.currentTime = 0;
        } catch {
          /* empty */
        }
      };
      if (id) {
        pending.delete(id);
        const player = players.get(id);
        if (player) {
          stopOne(player);
        }
        return;
      }
      pending.clear();
      for (const player of players.values()) {
        stopOne(player);
      }
    },
  };
}
