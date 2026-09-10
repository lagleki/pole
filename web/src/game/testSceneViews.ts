/**
 * Headless SVG/scene fakes for vitest — production always mounts real views in main.ts.
 * Prefer these over canvas screenCopy choreography in tests.
 */
import type { GameContext } from './gameTypes';
import type { AlphabetView } from './svgAlphabet';
import type { AssistView } from './svgAssist';
import type { AdwareView } from './svgAdware';
import type { BoardView } from './svgBoard';
import type { BoxesView } from './svgBoxes';
import type { CeremonyView } from './svgCeremony';
import type { SplashView } from './svgSplash';
import type { HandView } from './svgHand';
import type { LetterPadView } from './svgLetterPad';
import { firstAvailableLetter } from './roundWord';
import type { HudView } from './svgHud';
import type { PlayersView } from './svgPlayers';
import type { YakView } from './svgYakubovich';

const noop = (): void => {};

export function fakeAlphabet(): AlphabetView {
  return {
    setAvailable: noop,
    setVisible: noop,
    setVanishFrame: noop,
  };
}

export function fakeAssist(): AssistView {
  return {
    loadSprites: noop,
    sync: noop,
    setVisible: noop,
  };
}

export function fakeAdware(): AdwareView {
  return {
    loadSprites: noop,
    setVisible: noop,
    setRise: noop,
  };
}

export function fakeBoard(): BoardView {
  return {
    setVisible: noop,
    setStage: noop,
    setBanner: noop,
    setWordBoard: noop,
  };
}

export function fakeBoxes(): BoxesView {
  return {
    loadSprites: noop,
    setVisible: noop,
    show: noop,
  };
}


export function fakeSplash(): SplashView {
  return {
    loadSprites: noop,
    setVisible: noop,
    reset: noop,
    setWipeFrame: noop,
    setVLineFrame: noop,
    addHStripeColumn: noop,
    addVStripeRow: noop,
    showLogos: noop,
    setTitleLetters: noop,
    showCredits: noop,
  };
}

export function fakeCeremony(): CeremonyView {
  return {
    loadSprites: noop,
    setVisible: noop,
    showStage: noop,
    clearRubs: noop,
    addRub: noop,
    showTop8: noop,
    setTop8Rise: noop,
  };
}

export function fakeHand(): HandView {
  return {
    sync: noop,
    setVisible: noop,
  };
}

export type FakeLetterPad = LetterPadView & {
  /** Resolve a pending show(); returns false if the pad is not open. */
  choose(index?: number): boolean;
  isOpen(): boolean;
};

/**
 * Test letter pad. `auto: true` (default) picks immediately — fine for NPC paths.
 * `auto: false` waits for `choose()` so human drivers can observe `letter-pick`.
 */
export function fakeLetterPad(opts?: {
  pick?: (available: Uint8Array) => number;
  auto?: boolean;
}): FakeLetterPad {
  const auto = opts?.auto !== false;
  let pending: {
    available: Uint8Array;
    resolve: (n: number) => void;
    reject: (reason?: unknown) => void;
  } | null = null;

  const pickIndex = (available: Uint8Array, index?: number): number => {
    if (index !== undefined) {
      return index;
    }
    if (opts?.pick) {
      return opts.pick(available);
    }
    return firstAvailableLetter(available);
  };

  return {
    async show(available: Uint8Array): Promise<number> {
      if (auto) {
        return pickIndex(available);
      }
      return await new Promise<number>((resolve, reject) => {
        pending = { available, resolve, reject };
      });
    },
    hide(): void {
      if (pending) {
        const { reject } = pending;
        pending = null;
        reject(new DOMException('letter-pad-hidden', 'AbortError'));
      }
    },
    setAvailable: noop,
    choose(index?: number): boolean {
      if (!pending) {
        return false;
      }
      const { available, resolve } = pending;
      pending = null;
      resolve(pickIndex(available, index));
      return true;
    },
    isOpen(): boolean {
      return pending !== null;
    },
  };
}

export function fakeHud(): HudView {
  return {
    setVisible: noop,
    setSeats: noop,
    setNameEntry: noop,
    showTalk: noop,
    showChoice: noop,
    showSingleChoice: noop,
    hideBubbles: noop,
  };
}

export function fakePlayers(): PlayersView {
  return {
    loadSprites: noop,
    setVisible: noop,
    sync: noop,
    setSeat: noop,
  };
}

export function fakeYak(): YakView {
  return {
    loadSprites: noop,
    setVisible: noop,
    showIdle: noop,
    setPose: noop,
  };
}

/** Attach the scene-graph fakes production always mounts. */
export function attachSceneFakes(ctx: GameContext): void {
  ctx.alphabet = fakeAlphabet();
  ctx.assist = fakeAssist();
  ctx.adware = fakeAdware();
  ctx.board = fakeBoard();
  ctx.boxes = fakeBoxes();
  ctx.ceremony = fakeCeremony();
  ctx.splash = fakeSplash();
  ctx.hand = fakeHand();
  ctx.letterPad = fakeLetterPad();
  ctx.hud = fakeHud();
  ctx.players = fakePlayers();
  ctx.yak = fakeYak();
}
