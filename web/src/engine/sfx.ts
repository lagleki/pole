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

export interface GameSfx {
  play(id: SfxId, options?: SfxPlayOptions): void;
  stop(id?: SfxId): void;
  setVolume(id: SfxId, volume: number): void;
  /** Unlock HTMLAudio on a user gesture. Safe to call again; does not pause playing cues. */
  prime(): Promise<void>;
  /** Create `<audio>` nodes and start loading mp3 before the first gesture. */
  warmup(): void;
}

function isWebDriver(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.webdriver);
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

/**
 * HTMLAudio playback. Skipped when muted, in Node, or under Playwright
 * (`navigator.webdriver`), matching host TTS.
 */
const SFX_IDS = Object.keys(SFX_FILES) as SfxId[];

export function createGameSfx(options: { getEnabled: () => boolean }): GameSfx {
  const players = new Map<SfxId, HTMLAudioElement>();
  const pending = new Map<SfxId, SfxPlayOptions>();
  let primed = false;
  let priming: Promise<void> | null = null;

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

  const start = (id: SfxId, playOptions: SfxPlayOptions): void => {
    const player = element(id);
    if (!player) {
      return;
    }
    const restart = playOptions.restart !== false;
    player.loop = Boolean(playOptions.loop);
    player.volume = clampVolume(playOptions.volume ?? 1);
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
      });
    }
  };

  const flushPending = (): void => {
    const queued = [...pending.entries()];
    pending.clear();
    for (const [id, playOptions] of queued) {
      if (options.getEnabled()) {
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
      if (typeof Audio === 'undefined' || isWebDriver()) {
        primed = true;
        return Promise.resolve();
      }
      const unlocks = SFX_IDS.map((id) => {
        const player = element(id);
        if (!player) {
          return Promise.resolve();
        }
        player.muted = true;
        const p = player.play();
        if (!p || typeof p.then !== 'function') {
          player.muted = false;
          return Promise.resolve();
        }
        return p
          .then(() => {
            player.pause();
            try {
              player.currentTime = 0;
            } catch {
              /* empty */
            }
            player.muted = false;
          })
          .catch(() => {
            player.muted = false;
          });
      });
      priming = Promise.all(unlocks).then(() => {
        primed = true;
        priming = null;
        flushPending();
      });
      return priming;
    },

    play(id: SfxId, playOptions: SfxPlayOptions = {}): void {
      if (!options.getEnabled() || isWebDriver()) {
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
      const player = players.get(id);
      if (player) {
        player.volume = clampVolume(volume);
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
