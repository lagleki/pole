import { describe, expect, it } from 'vitest';

import type { TopPlayerRecord } from '../assets/pic';
import { PwmAudio, SilentOutput } from '../engine/audio';
import type { GameSfx, SfxId } from '../engine/sfx';
import { GameInput } from '../engine/input';
import { BorlandRng } from '../engine/rng';
import { Screen } from '../engine/screen';
import { VirtualClock } from '../engine/timing';
import type { Machine } from '../engine/types';
import { PROGRESS_VERSION, type GameProgressSave } from './persist';
import { createDebugState, runGame, type GameContext, type Scene } from './script';
import { fonts, lib, ovl, pic } from './testAssets';

interface Harness {
  machine: Machine;
  clock: VirtualClock;
  input: GameInput;
  ctx: GameContext;
  sceneHistory: Scene[];
  topPlayers: TopPlayerRecord[];
  controller: AbortController;
}

function buildHarness(seed: number, humanSeats: 1 | 2 = 2): Harness {
  const controller = new AbortController();
  const { signal } = controller;
  const screen = new Screen();
  screen.setSprites(lib.sprites);
  screen.setFonts(fonts);
  const clock = new VirtualClock(signal);
  const rng = new BorlandRng(seed);
  const input = new GameInput(screen, clock, signal);
  const audio = new PwmAudio(clock, rng, new SilentOutput());

  const machine: Machine = { screen, input, audio, clock, rng, signal };
  const state = createDebugState();

  // Record every scene transition without touching the script.
  const sceneHistory: Scene[] = [];
  let scene: Scene = state.scene;
  Object.defineProperty(state, 'scene', {
    get: () => scene,
    set: (value: Scene) => {
      scene = value;
      if (sceneHistory[sceneHistory.length - 1] !== value) {
        sceneHistory.push(value);
      }
    },
  });

  const topPlayers = pic.map((entry) => ({ ...entry }));
  // humanSeats: 2 = the original prompt behavior, where empty names hand
  // every seat to an NPC — the self-playing setup these tests rely on.
  const ctx: GameContext = {
    machine,
    questions: ovl.questions,
    topPlayers,
    state,
    options: { humanSeats },
  };
  return { machine, clock, input, ctx, sceneHistory, topPlayers, controller };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

/**
 * Drive a full game: drain all virtual-time delays, and whenever the script
 * parks on an input wait (queue empty), press Space then Enter. With no name
 * typed every seat becomes an NPC, so the game plays itself to the finale.
 */
async function driveFullGame(h: Harness, maxRounds = 6000, until?: () => boolean): Promise<void> {
  let finished = false;
  let failure: unknown = null;
  const run = runGame(h.ctx).then(
    () => {
      finished = true;
    },
    (error: unknown) => {
      finished = true;
      if (!h.controller.signal.aborted) {
        failure = error;
      }
    },
  );

  for (let round = 0; round < maxRounds; round += 1) {
    if (until) {
      // Small steps so `until` can fire during a scene that no longer parks
      // on an INFINITE key wait (e.g. word-select after the tour prompt).
      if (h.clock.pendingCount > 0) {
        await h.clock.advance(50);
      }
    } else {
      await h.clock.runAll(5_000_000);
    }
    await flush();
    if (finished || until?.()) {
      break;
    }
    h.input.handleKey(' ');
    await flush();
    h.input.handleKeyUp(' ');
    h.input.handleKey('Enter');
    await flush();
    h.input.handleKeyUp('Enter');
    await flush();
  }

  if (until?.()) {
    h.controller.abort(new DOMException('test-done', 'AbortError'));
    await h.clock.advance(0);
    await run;
    return;
  }
  if (!finished) {
    throw new Error(`driver exhausted ${maxRounds} rounds; stuck in scene "${h.ctx.state.scene}"`);
  }
  await run;
  if (failure) {
    throw failure;
  }
}

describe('full game script (headless, virtual time, real assets)', () => {
  it('plays an entire 7-stage all-NPC game through the supergame to done (seed 1)', async () => {
    const h = buildHarness(1);
    await driveFullGame(h);

    const { state } = h.ctx;
    expect(state.scene).toBe('done');
    expect(state.stage).toBe(7);

    for (const expected of [
      'splash', 'stage-setup', 'presentation', 'word-select', 'turn', 'letter-pick',
      'letter-open', 'adware', 'supergame-setup', 'supergame-prizes', 'supergame-choice',
      'supergame-spin', 'supergame-letters', 'supergame-think', 'supergame-solve',
      'top-players', 'done',
    ] as Scene[]) {
      expect(h.sceneHistory).toContain(expected);
    }
    expect(h.sceneHistory).not.toContain('box-game');
    expect(h.sceneHistory).not.toContain('prize');
    expect(h.sceneHistory).not.toContain('word-solve');

    expect(h.sceneHistory.filter((s) => s === 'stage-setup')).toHaveLength(7);
    expect(state.supergame).toBeDefined();

    // Session leaderboard stays within the original bounds.
    expect(h.topPlayers.length).toBeLessThanOrEqual(8);
    for (const entry of h.topPlayers) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(0xffff);
    }

    // All seats are NPCs (seat 0 is never prompted; empty names fall back).
    for (const seat of state.seats) {
      expect(seat.isHuman).toBe(false);
      expect(seat.name.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it('is deterministic for a fixed seed', async () => {
    const a = buildHarness(42);
    await driveFullGame(a);
    const b = buildHarness(42);
    await driveFullGame(b);

    expect(a.sceneHistory).toEqual(b.sceneHistory);
    expect(a.ctx.state.seats).toEqual(b.ctx.state.seats);
    expect(a.topPlayers).toEqual(b.topPlayers);
  }, 240_000);

  it('different seeds explore different games but still finish (seed sweep)', async () => {
    for (const seed of [7, 1993, 0xdeadbeef]) {
      const h = buildHarness(seed);
      await driveFullGame(h);
      expect(h.ctx.state.scene).toBe('done');
    }
  }, 360_000);

  it('splash click skips the intro and opens the studio', async () => {
    const h = buildHarness(1);
    const run = runGame(h.ctx).catch((error: unknown) => {
      if (!h.controller.signal.aborted) {
        throw error;
      }
    });
    await flush();
    h.input.pointerDown();
    h.input.pointerUp();
    await flush();
    await h.clock.advance(30);
    await flush();

    expect(h.sceneHistory).toContain('splash');
    expect(h.ctx.state.scene).not.toBe('splash');
    expect(h.sceneHistory).toContain('stage-setup');

    h.controller.abort(new DOMException('test-done', 'AbortError'));
    await h.clock.advance(0);
    await run;
  });

  it('1-player mode (web default): empty name keeps seat 1 human as «ИГРОК», others are NPCs', async () => {
    const h = buildHarness(5, 1);
    // Stop while the host still speaks the tour prompt (before the first spin).
    await driveFullGame(h, 6000, () => h.ctx.state.scene === 'word-select');

    const seats = h.ctx.state.seats;
    expect(seats[1].isHuman).toBe(true);
    expect(seats[1].name).toBe('ИГРОК');
    expect(seats[0].isHuman).toBe(false);
    expect(seats[2].isHuman).toBe(false);
    expect(seats[0].name.length).toBeGreaterThan(0);
    expect(seats[2].name.length).toBeGreaterThan(0);
  }, 60_000);

  it('new-round resume (between-rounds): checkpoint before music, then playersEnter', async () => {
    const h = buildHarness(42, 1);
    const timeline: string[] = [];

    const sfx: GameSfx = {
      play(id: SfxId) {
        timeline.push(`play:${id}`);
      },
      stop(id) {
        timeline.push(id ? `stop:${id}` : 'stop');
      },
      setVolume() {},
      async prime() {},
      warmup() {},
      retryPending() {},
      isPrimed: () => true,
      getTrackState: () => ({
        primed: true,
        pending: false,
        paused: true,
        currentTime: 0,
        volume: 0,
      }),
    };
    h.ctx.sfx = sfx;
    h.ctx.persist = {
      save(snapshot: GameProgressSave) {
        timeline.push(`save:${snapshot.checkpoint}:stage${snapshot.stage}`);
      },
      clear() {},
    };
    h.ctx.resume = {
      version: PROGRESS_VERSION,
      checkpoint: 'between-rounds',
      rngState: 42,
      humanSeats: 1,
      charId: 2,
      characters: [{ spriteId: 51, name: 'КРОЛИК' }],
      seats: [
        { spriteId: 17, nameBytes: [0x88, 0x83, 0x90, 0x8e, 0x8a], score: 15 },
        { spriteId: 51, nameBytes: [0x90, 0x8e, 0x92, 0x84], score: 0 },
        { spriteId: null, nameBytes: [], score: 5 },
      ],
      available: Array.from({ length: 32 }, (_, i) => (i === 0 ? 0x20 : 0x80 + i)),
      curSector: 6,
      winner: 3,
      stage: 1,
      curPlayer: 0,
      movesForBox: 1,
      prevWords: [3, -1, -1, -1, -1, -1, -1, -1],
      guessedWord: [],
      remaindLetters: 0,
      wordPos: 121,
      opened: [],
      theme: 'ТЕМА',
      topPlayers: [{ name: 'ТЕСТ', score: 10 }],
    };

    await driveFullGame(
      h,
      6000,
      () => h.ctx.state.scene === 'presentation' || h.ctx.state.scene === 'word-select',
    );

    expect(h.sceneHistory).not.toContain('splash');
    expect(h.sceneHistory).toContain('stage-setup');
    expect(h.ctx.state.stage).toBe(1);

    const saveIdx = timeline.indexOf('save:between-rounds:stage1');
    const stingIdx = timeline.indexOf('play:sting');
    const enterIdx = timeline.indexOf('play:playersEnter');
    expect(saveIdx).toBeGreaterThanOrEqual(0);
    expect(stingIdx).toBeGreaterThanOrEqual(0);
    expect(enterIdx).toBeGreaterThanOrEqual(0);
    expect(saveIdx).toBeLessThan(stingIdx);
    expect(saveIdx).toBeLessThan(enterIdx);
    expect(stingIdx).toBeLessThan(enterIdx);
  }, 30_000);
});
