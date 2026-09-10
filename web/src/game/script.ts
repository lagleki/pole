import { decodeCp866, encodeCp866 } from '../encoding/cp866';
import type { Machine } from '../engine/types';
import { BACKBUF, INFINITE, SCREEN_W } from '../engine/types';
import { type SfxId, type SfxPlayOptions } from '../engine/sfx';
import { defaultAssetSpec } from '../spec';
import {
  CHARACTERS,
  PRIZES,
  SEATS,
  STAGE_NAMES,
  TOURNAMENT_ROUNDS,
  liveSeat,
} from './constants';
import { PROGRESS_VERSION, type GameProgressSave } from './persist';
import type { BoardWordCell } from './svgBoard';
import type { SpriteBox } from './svgHud';
import {
  BRICK_COUNT,
  restoredBrickKinds,
} from './svgStudio';
import { basketTotal, type SupergamePrize } from './supergamePrizes';

import {
  assistantOpenWalk as runAssistantOpenWalk,
  type AssistStop,
  type AssistantWalkOptions,
} from './assistantWalk';
import type { LetterAward } from './letterAward';
import {
  stageSetup as runStageSetup,
  presentation as runPresentation,
  selectWord as runSelectWord,
  type StageRoundHost,
} from './stageRound';
import {
  pickLetter as runPickLetter,
  openLetter as runOpenLetter,
  assistantRevealRemainingLetters as runAssistantRevealRemainingLetters,
  takeTurn as runTakeTurn,
  nextPlayer as runNextPlayer,
  type PlayerTurnHost,
} from './playerTurn';
import {
  runSupergame,
  type SupergameFlowHost,
} from './supergameFlow';
import { adware as runAdware, type AdwareFlowHost } from './adwareFlow';
import { ENDGAME_LAYOUT, TOP8_I0, type CeremonyLine } from './svgCeremony';
import {
  SPLASH_TIMING,
  SPLASH_TITLE_LETTERS,
  splashHStripeColumns,
  splashVStripeRows,
} from './svgSplash';
import { animateFrames } from './tween';
import {
  yakubovichSetSilent as runYakubovichSetSilent,
  yakubovichTalk as runYakubovichTalk,
  yakubovichReply as runYakubovichReply,
  type YakubovichHost,
} from './yakubovich';
import {
  playerSay as runPlayerSay,
  playerDecision as runPlayerDecision,
  playerConfirm as runPlayerConfirm,
  updateMoney as runUpdateMoney,
  type PlayerPresentationHost,
} from './playerPresentation';
import { spinDrum } from './spinDrum';
import { playerVoiceRole } from './playerVoice';
import type { GameSeat, Scene, GameContext } from './gameTypes';

/**
 * Direct port of the original game's MainThread (dpr:792-1647) plus its
 * drawing/dialogue helpers (dpr:463-637). `dpr:NNN` refers to
 * reference/delphi/PoleWin32.cp866.txt (public-domain reconstruction
 * of POLE2.EXE; line numbers match Pole2/PoleWin32.dpr).
 *
 * Deviations from the literal Delphi code follow the DOS-first policy in
 * docs/architecture.md and are marked with `DOS:` or `WEB:`
 * comments at each site.
 */

const SPRITE = defaultAssetSpec.spriteIds;

export {
  ASSIST_STAY_WIDTH,
  WORD_CELL_WIDTH,
  ASSIST_STAND_SHIFT,
} from './assistantWalk';

export { playerVoiceRole } from './playerVoice';
export { moneyRecountStride } from './moneyRecount';
export type {
  Scene,
  SeatDebug,
  GameDebugState,
  GameOptions,
  GameContext,
  GameSeat,
} from './gameTypes';
export { createDebugState } from './gameTypes';

class Game {
  private readonly m: Machine;
  private readonly ctx: GameContext;
  private readonly seats: GameSeat[] = SEATS.map(() => ({ spriteId: null, nameBytes: new Uint8Array(0), score: 0 }));
  /** Per-run copy of the character table (dpr:141 is a static global, fresh each program launch). */
  private readonly characters = CHARACTERS.map((c) => ({ ...c }));
  /** Scratch PWM buffer, the original's AudioBuf (dpr:152). */
  private readonly audioBuf = new Int16Array(8192);
  /** CP866 bytes 0x80..0x9F or 0x20 once used (dpr:820, 1024-1031). */
  private readonly available = new Uint8Array(32);

  private charId = 0;
  private curSector = 0;
  private winner = 3;
  private stage = 0;
  /** DIFF #15 / #19: brick tile kinds for the SVG wallpaper (restore uses i%3). */
  private brickKinds: number[] = restoredBrickKinds();
  private curPlayer = 0;
  /** DOS: successful MOVES toward the box game (Delphi counted letters; deviation #4). */
  private movesForBox = 0;
  private readonly prevWords: number[] = new Array(TOURNAMENT_ROUNDS).fill(-1);

  private guessedWord: Uint8Array = new Uint8Array(0);
  private remaindLetters = 0;
  private wordPos = 0;
  private opened: boolean[] = [];
  private readonly humanSeats: 1 | 2;
  /** WEB: seat whose SVG plaque is being introduced (name not assigned yet). */
  private hudIntroSeat: number | null = null;
  /** WEB: SVG money-stack jitter during recount. */
  private moneyJitter: { seat: number; x: number; y: number } | null = null;
  /** WEB: score shown on the SVG pile during recount (climbs with ticks). */
  private moneyShowScore: { seat: number; score: number } | null = null;
  private skipToTurns = false;
  /** WEB: resume straight to letter-pick (spin already done). */
  private resumeAtLetterPick: { awardKind: 'perHit' | 'double' | 'keep'; awardUnit: number } | null = null;
  /** WEB: resume with letter already chosen (no re-pick / re-spin). */
  private resumeAtBoxChosen: { choice: number; winning: number } | null = null;
  private resumeAtLetterOpen: {
    awardKind: 'perHit' | 'double' | 'keep';
    awardUnit: number;
    letterIdx: number;
    plusPosition: number;
  } | null = null;
  /** WEB: resume after drum stop — apply sector without spinning again. */
  private resumeAfterSpin = false;
  /** WEB: resume straight to round-end (word already solved). */
  private resumeAtRoundWon = false;
  /** WEB: between-rounds reload — keep seat names/scores, skip re-presentation. */
  private resumingBetweenRounds = false;
  /**
   * WEB: winner seat data stashed while stageSetup/presentation clear the stage.
   * Previous-round sprite + label must not linger; restored when that seat is revealed.
   */
  private winnerCarry: {
    seat: number;
    spriteId: number | null;
    nameBytes: Uint8Array;
    score: number;
  } | null = null;
  /** WEB DIFF #31: post-finals supergame state. */
  private stageBanner: string | null = null;
  private supergameActive = false;
  private supergamePlayer = -1;
  private supergameBasket: SupergamePrize[] = [];
  private superPrize = '';
  private supergameWon: boolean | null = null;
  private supergameAtRisk = false;
  private superSector = 0;
  private wheelSuperMode = false;

  constructor(ctx: GameContext) {
    this.humanSeats = ctx.options?.humanSeats ?? 1;
    this.ctx = ctx;
    this.m = ctx.machine;
  }

  // ---------------------------------------------------------------- helpers

  private get screen() {
    return this.m.screen;
  }

  private setScene(scene: Scene): void {
    this.ctx.state.scene = scene;
    this.syncDebug();
  }

  /** Round snapshot for assist walk — skip when the SVG stack owns the board. */
  private snapshotRoundToBackbuf(): void {
    if (this.ctx.board && this.ctx.assist) {
      return;
    }
    this.screen.screenCopy(SCREEN_W, 120, BACKBUF, 0);
  }

  private syncDebug(): void {
    const s = this.ctx.state;
    s.stage = this.stage;
    s.currentPlayer = this.curPlayer;
    s.currentSector = this.curSector;
    s.word = decodeCp866(this.guessedWord);
    s.opened = [...this.opened];
    s.usedLetters = [];
    for (let i = 0; i < 32; i += 1) {
      if (this.available[i] === 0x20) {
        s.usedLetters.push(decodeCp866(new Uint8Array([0x80 + i])));
      }
    }
    s.seats = this.seats.map((seat) => ({
      name: decodeCp866(seat.nameBytes),
      score: seat.score,
      isHuman: seat.spriteId === SPRITE.PLAYER,
      removed: seat.spriteId === null,
    }));
    s.winner = this.winner;
    s.movesForBox = this.movesForBox;
    if (this.supergameBasket.length > 0 || this.superPrize || this.supergameAtRisk || this.supergameWon !== null) {
      s.supergame = {
        basket: this.supergameBasket.map((item) => ({ ...item })),
        superPrize: this.superPrize,
        atRisk: this.supergameAtRisk,
        won: this.supergameWon,
      };
    } else {
      s.supergame = undefined;
    }
  }

  private isHuman(seatIdx: number): boolean {
    return this.seats[seatIdx].spriteId === SPRITE.PLAYER;
  }

  /** Name typed at presentation (CP866, usually ALL CAPS); TTS recases it. */
  private playerName(seatIdx: number): string {
    const bytes = this.seats[seatIdx].nameBytes;
    if (bytes.length > 0) {
      return decodeCp866(bytes);
    }
    return liveSeat(seatIdx).caption;
  }

  private delay(ms: number): Promise<void> {
    return this.m.clock.delay(ms);
  }

  private waitKey(timeoutMs: number): Promise<boolean> {
    return this.m.input.waitKeyPressed(timeoutMs);
  }

  private playSfx(id: SfxId, options?: SfxPlayOptions): void {
    this.ctx.sfx?.play(id, options);
  }

  private stopSfx(id?: SfxId): void {
    this.ctx.sfx?.stop(id);
  }

  private setSfxVolume(id: SfxId, volume: number): void {
    this.ctx.sfx?.setVolume(id, volume);
  }

  private random(n: number): number {
    return this.m.rng.random(n);
  }

  private len(text: string): number {
    return encodeCp866(text).length;
  }

  // ------------------------------------------------------- drawing routines

  /** dpr:463-482. DIFF #19: rim/base/arrow sprites are an SVG overlay. */
  private drawFortuneWheel(a: number): void {
    const s = this.screen;
    if (!this.ctx.wheel) {
      s.fillRect(0x3030 * 8, 172, 223, 7);
    }
    const seat0 = this.seats[0];
    if (!this.useSvgPlayers() && seat0.spriteId !== null) {
      s.drawSprite(seat0.spriteId, liveSeat(0).spriteOfs, 2);
    }
    this.ctx.wheel?.setFrame(a);
    this.ctx.wheel?.setVisible(true);
    this.syncStudio(true);
    this.syncBoard(true);
    this.syncAlphabet(true);
    this.syncHud(true);
    this.syncPlayers(true);
  }

  private hideWheel(): void {
    this.ctx.wheel?.setVisible(false);
    this.ctx.board?.setVisible(false);
    this.ctx.alphabet?.setVisible(false);
    this.ctx.hud?.setVisible(false);
    this.ctx.hud?.hideBubbles();
    this.ctx.players?.setVisible(false);
    this.ctx.assist?.setVisible(false);
    this.ctx.yak?.setVisible(false);
    this.ctx.studio?.setVisible(false);
    this.ctx.boxes?.setVisible(false);
    this.ctx.adware?.setVisible(false);
    this.ctx.ceremony?.setVisible(false);
    this.ctx.splash?.setVisible(false);
  }

  private syncBoard(
    visible = true,
    revealedDuringWalk?: ReadonlySet<number>,
    openBeforeWalk?: ReadonlySet<number>,
  ): void {
    const board = this.ctx.board;
    if (!board) {
      return;
    }
    if (this.stageBanner) {
      board.setBanner(this.stageBanner);
    } else {
      board.setStage(this.stage);
    }
    board.setWordBoard(this.wordPos, this.wordBoardCells(undefined, revealedDuringWalk, openBeforeWalk));
    board.setVisible(visible);
  }

  private syncStudio(visible = true): void {
    const studio = this.ctx.studio;
    if (!studio) {
      return;
    }
    studio.setBricks(this.brickKinds);
    studio.setVisible(visible);
  }

  private wordBoardCells(
    entryBytes?: Uint8Array,
    revealedDuringWalk?: ReadonlySet<number>,
    openBeforeWalk?: ReadonlySet<number>,
  ): BoardWordCell[] {
    const cells: BoardWordCell[] = [];
    for (const [i] of this.guessedWord.entries()) {
      if (entryBytes && i < entryBytes.length) {
        cells.push({
          letter: decodeCp866(entryBytes.subarray(i, i + 1)),
          state: 'entry',
        });
      } else if (
        this.opened[i]
        && (!revealedDuringWalk || openBeforeWalk?.has(i) || revealedDuringWalk.has(i))
      ) {
        cells.push({
          letter: decodeCp866(this.guessedWord.subarray(i, i + 1)),
          state: 'open',
        });
      } else {
        cells.push({ letter: '', state: 'hidden' });
      }
    }
    return cells;
  }

  private syncAlphabet(_visible = true): void {
    // WEB: letter pick uses the mobile letter pad; the DOS alphabet strip is retired.
    const alphabet = this.ctx.alphabet;
    if (!alphabet) {
      return;
    }
    alphabet.setAvailable(this.available);
    alphabet.setVisible(false);
  }

  private syncHud(visible = true, blink?: { seat: number; on: boolean }): void {
    const hud = this.ctx.hud;
    if (!hud) {
      return;
    }
    hud.setSeats(
      this.seats.map((seat, i) => ({
        caption: liveSeat(i).caption,
        name: decodeCp866(seat.nameBytes),
        present: this.supergameActive
          ? i === this.supergamePlayer && seat.spriteId !== null
          : seat.nameBytes.length > 0 || blink?.seat === i || this.hudIntroSeat === i,
        score: this.supergameActive
          ? null
          : this.moneyShowScore?.seat === i
            ? this.moneyShowScore.score
            : seat.spriteId !== null || this.hudIntroSeat === i
              ? seat.score
              : null,
        jitter: this.moneyJitter?.seat === i ? { x: this.moneyJitter.x, y: this.moneyJitter.y } : undefined,
      })),
      blink,
    );
    hud.setVisible(visible);
  }

  private syncPlayers(visible = true): void {
    const players = this.ctx.players;
    if (!players || !this.useSvgPlayers()) {
      return;
    }
    if (!visible) {
      players.setVisible(false);
      return;
    }
    players.sync(
      this.seats.map((seat, i) => ({
        spriteId: this.supergameActive && i !== this.supergamePlayer ? null : seat.spriteId,
        ofs: liveSeat(i).spriteOfs,
      })),
    );
  }

  /** SVG seats whenever the overlay exists. */
  private useSvgPlayers(): boolean {
    return Boolean(this.ctx.players);
  }

  /** Blit or SVG-sync one seat sprite (null clears). */
  private paintSeatSprite(seatIdx: number, spriteId: number | null = this.seats[seatIdx].spriteId): void {
    const layout = liveSeat(seatIdx);
    if (this.useSvgPlayers()) {
      this.ctx.players!.setSeat(seatIdx, spriteId);
      return;
    }
    if (spriteId === null) {
      this.screen.fillRect(layout.spriteOfs, 83, 87, 7);
      return;
    }
    this.screen.drawSprite(spriteId, layout.spriteOfs, 2);
  }

  private spriteBox(seatIdx: number, poseWidth?: number): SpriteBox {
    const layout = liveSeat(seatIdx);
    return {
      x: layout.spriteOfs % SCREEN_W,
      y: Math.floor(layout.spriteOfs / SCREEN_W),
      w: poseWidth ?? 87,
      h: 83,
    };
  }

  private talkSide(seatIdx: number): 'west' | 'east' {
    return seatIdx === 1 ? 'east' : 'west';
  }

  private persistCheckpoint(
    checkpoint: GameProgressSave['checkpoint'],
    award?: { kind: 'perHit'; unit: number } | { kind: 'double' } | { kind: 'keep' },
    pick?: { letterIdx?: number; plusPosition?: number; boxChoice?: number; boxWinning?: number },
  ): void {
    if (!this.ctx.persist) {
      return;
    }
    if (checkpoint === 'in-round' && this.remaindLetters <= 0) {
      return;
    }
    this.ctx.persist.save({
      version: PROGRESS_VERSION,
      checkpoint,
      rngState: this.m.rng.getState(),
      humanSeats: this.humanSeats,
      charId: this.charId,
      characters: this.characters.map((c) => ({ spriteId: c.spriteId, name: c.name })),
      seats: this.seats.map((seat) => ({
        spriteId: seat.spriteId,
        nameBytes: Array.from(seat.nameBytes),
        score: seat.score,
      })),
      available: Array.from(this.available),
      curSector: this.curSector,
      winner: this.winner,
      stage: this.stage,
      curPlayer: this.curPlayer,
      movesForBox: this.movesForBox,
      prevWords: [...this.prevWords],
      guessedWord: Array.from(this.guessedWord),
      remaindLetters: this.remaindLetters,
      wordPos: this.wordPos,
      opened: [...this.opened],
      theme: this.ctx.state.theme,
      topPlayers: this.ctx.topPlayers.map((row) => ({ ...row })),
      ...(award !== undefined && { awardKind: award.kind, awardUnit: award.kind === 'perHit' ? award.unit : undefined }),
      ...(pick !== undefined && {
        ...(pick.letterIdx !== undefined && { pickedLetterIdx: pick.letterIdx }),
        ...(pick.plusPosition !== undefined && { plusPosition: pick.plusPosition }),
        ...(pick.boxChoice !== undefined && { boxChoice: pick.boxChoice }),
        ...(pick.boxWinning !== undefined && { boxWinning: pick.boxWinning }),
      }),
    });
  }

  private applyResume(save: GameProgressSave): void {
    this.charId = save.charId;
    this.curSector = save.curSector;
    this.winner = save.winner;
    this.stage = save.stage;
    this.curPlayer = save.curPlayer;
    if (save.winner >= 3 && (save.checkpoint === 'between-rounds' || save.checkpoint === 'word-solved')) {
      this.winner = save.curPlayer;
    }
    this.movesForBox = save.movesForBox;
    this.m.rng.seed(save.rngState);
    for (let i = 0; i < this.characters.length; i += 1) {
      const src = save.characters[i];
      if (src) {
        this.characters[i] = { ...src };
      }
    }
    for (let i = 0; i < 3; i += 1) {
      const src = save.seats[i];
      this.seats[i] = {
        spriteId: src.spriteId,
        nameBytes: Uint8Array.from(src.nameBytes),
        score: src.score,
      };
    }
    this.available.set(Uint8Array.from(save.available));
    for (let i = 0; i < TOURNAMENT_ROUNDS; i += 1) {
      this.prevWords[i] = save.prevWords[i] ?? -1;
    }
    this.guessedWord = Uint8Array.from(save.guessedWord);
    this.remaindLetters = save.remaindLetters;
    this.wordPos = save.wordPos;
    this.opened = [...save.opened];
    this.ctx.state.theme = save.theme;
    this.ctx.topPlayers.length = 0;
    this.ctx.topPlayers.push(...save.topPlayers.map((row) => ({ ...row })));
    this.skipToTurns =
      save.checkpoint === 'in-round' ||
      save.checkpoint === 'after-spin' ||
      save.checkpoint === 'letter-pick' ||
      save.checkpoint === 'letter-open' ||
      save.checkpoint === 'box-chosen' ||
      save.checkpoint === 'word-solved';
    this.resumeAfterSpin = save.checkpoint === 'after-spin';
    this.resumeAtBoxChosen = save.checkpoint === 'box-chosen'
      ? { choice: save.boxChoice ?? 0, winning: save.boxWinning ?? 0 }
      : null;
    this.resumeAtLetterPick = save.checkpoint === 'letter-pick'
      ? { awardKind: save.awardKind ?? 'keep', awardUnit: save.awardUnit ?? 0 }
      : null;
    this.resumeAtLetterOpen = save.checkpoint === 'letter-open'
      ? {
          awardKind: save.awardKind ?? 'keep',
          awardUnit: save.awardUnit ?? 0,
          letterIdx: save.pickedLetterIdx ?? 0,
          plusPosition: save.plusPosition ?? 0,
        }
      : null;
    this.resumeAtRoundWon = save.checkpoint === 'word-solved';
    this.resumingBetweenRounds = save.checkpoint === 'between-rounds';
    this.syncDebug();
  }

  /** Full studio from saved seats/board/wheel — every resume path. */
  private paintRestoredStudio(): void {
    this.paintStudioWalls(restoredBrickKinds());
    this.drawBoardChrome();
    this.paintAlphabetRow();
    this.paintWordBoard();
    this.paintSeats();
    this.drawFortuneWheel(this.curSector);
  }

  private drawBoardChrome(): void {
    const s = this.screen;
    if (!this.ctx.studio) {
      s.fillRect(0x11580, 238, SCREEN_W, 7);
      s.drawSprite(SPRITE.WALL_LEFT, 25 * SCREEN_W, 7);
      s.drawSprite(SPRITE.WALL_RIGHT, 600 + 25 * SCREEN_W, 7);
    }
    this.syncStudio(true);

    if (this.ctx.board) {
      this.syncBoard(true);
    } else {
      s.fillRect(15 * SCREEN_W + 120, 80, 400, 7);
      let k = 0xedf8;
      for (let i = 4; i >= 0; i -= 1) {
        s.fillChar(k, 400, 0);
        k -= 20 * SCREEN_W;
      }
      k = 520;
      for (let j = 25; j >= 0; j -= 1) {
        let n = 0x2580 + k;
        for (let i = 80; i >= 0; i -= 1) {
          s.fillChar(n, 1, 0);
          n += SCREEN_W;
        }
        k -= 16;
      }
      const stageName = this.stageBanner ?? STAGE_NAMES[this.stage] ?? '';
      s.print(stageName, 78 * SCREEN_W + 125 + 12 * 16 - ((this.len(stageName) >> 1) << 4), 0, 14, 16);
    }

    this.paintYakubovichStudio();
  }

  /** Studio host portrait — SVG overlay when available (DIFF #19). */
  private paintYakubovichStudio(): void {
    const yak = this.ctx.yak;
    if (yak) {
      yak.showIdle();
      return;
    }
    const s = this.screen;
    s.drawSprite(SPRITE.YAKUBOVICH_BASE, 0x1e0 + 0xac * SCREEN_W, 7);
    s.drawSprite(SPRITE.YAKUBOVICH_PASSIVE, 0x1ff + 0xad * SCREEN_W, 16);
    s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, 0x214 + 0xd1 * SCREEN_W, 16);
  }

  private paintAlphabetRow(): void {
    // Keep availability in sync for any leftover consumers; never show the strip.
    this.syncAlphabet(false);
  }

  private paintWordBoard(): void {
    if (this.ctx.board) {
      this.syncBoard(true);
      return;
    }
    const s = this.screen;
    for (let i = this.guessedWord.length - 1; i >= 0; i -= 1) {
      const cell = (i << 4) + this.wordPos + 11 * SCREEN_W;
      if (this.opened[i]) {
        s.fillRect(cell, 19, 15, 7);
        s.print(decodeCp866(this.guessedWord.subarray(i, i + 1)), cell + 4 + 2 * SCREEN_W, 0, 14, 8);
      } else {
        s.fillRect(cell, 19, 14, 8);
      }
    }
  }

  private paintScore(seatIdx: number): void {
    this.moneyJitter = null;
    this.moneyShowScore = null;
    if (this.supergameActive) {
      if (this.ctx.hud) {
        this.syncHud(true);
      }
      return;
    }
    if (this.ctx.hud) {
      this.syncHud(true);
      return;
    }
    const s = this.screen;
    const seat = this.seats[seatIdx];
    const { moneyOfs } = liveSeat(seatIdx);
    s.fillRect(moneyOfs - 644, 30, 84, 7);
    if (seat.score === 0) {
      s.drawSprite(SPRITE.SNIKERS, moneyOfs, 2);
      return;
    }
    s.drawSprite(SPRITE.MONEY, moneyOfs, 1);
    const text = String(seat.score);
    const center = moneyOfs + 0x22 - (text.length << 2) + 4 * SCREEN_W;
    s.print(text, center - 641, 0, 14, 8);
    s.print(text, center - 639, 0, 14, 8);
    s.print(text, center + 639, 0, 14, 8);
    s.print(text, center + 641, 0, 14, 8);
    s.print(text, center, 15, 14, 8);
  }

  private paintSeats(): void {
    const s = this.screen;
    for (let j = 0; j <= 2; j += 1) {
      const seat = this.seats[j];
      const layout = liveSeat(j);
      if (!this.ctx.hud) {
        s.fillRect(layout.labelOfs - 641, 30, 110, 0);
        s.fillRect(layout.labelOfs, 28, 108, 7);
        s.print(layout.caption, layout.labelOfs + 14, 0, 14, 8);
      }
      if (seat.spriteId !== null) {
        if (!this.useSvgPlayers()) {
          this.paintSeatSprite(j);
        }
        if (!this.ctx.hud) {
          s.print(seat.nameBytes, layout.labelOfs + 54 - (seat.nameBytes.length << 2) + 14 * SCREEN_W, 0, 14, 8);
        }
        this.paintScore(j);
      }
    }
    this.syncPlayers(true);
    this.syncHud(true);
  }

  /** dpr:503-509 */

  /** Shared host surface for extracted stage / turn / super-game / adware modules. */
  private flowHost(): StageRoundHost & PlayerTurnHost & SupergameFlowHost & AdwareFlowHost {
    const g = this;
    return {
      get screen() { return g.screen; },
      get m() { return g.m; },
      get ctx() { return g.ctx; },
      get seats() { return g.seats; },
      get available() { return g.available; },
      get audioBuf() { return g.audioBuf; },
      get prevWords() { return g.prevWords; },
      get characters() { return g.characters; },
      get humanSeats() { return g.humanSeats; },
      get stage() { return g.stage; },
      set stage(v) { g.stage = v; },
      get curSector() { return g.curSector; },
      set curSector(v) { g.curSector = v; },
      get winner() { return g.winner; },
      set winner(v) { g.winner = v; },
      get charId() { return g.charId; },
      set charId(v) { g.charId = v; },
      get curPlayer() { return g.curPlayer; },
      set curPlayer(v) { g.curPlayer = v; },
      get movesForBox() { return g.movesForBox; },
      set movesForBox(v) { g.movesForBox = v; },
      get guessedWord() { return g.guessedWord; },
      set guessedWord(v) { g.guessedWord = v; },
      get remaindLetters() { return g.remaindLetters; },
      set remaindLetters(v) { g.remaindLetters = v; },
      get wordPos() { return g.wordPos; },
      set wordPos(v) { g.wordPos = v; },
      get opened() { return g.opened; },
      set opened(v) { g.opened = v; },
      get hudIntroSeat() { return g.hudIntroSeat; },
      set hudIntroSeat(v) { g.hudIntroSeat = v; },
      get resumingBetweenRounds() { return g.resumingBetweenRounds; },
      set resumingBetweenRounds(v) { g.resumingBetweenRounds = v; },
      get winnerCarry() { return g.winnerCarry; },
      set winnerCarry(v) { g.winnerCarry = v; },
      get stageBanner() { return g.stageBanner; },
      set stageBanner(v) { g.stageBanner = v; },
      get supergameActive() { return g.supergameActive; },
      set supergameActive(v) { g.supergameActive = v; },
      get supergamePlayer() { return g.supergamePlayer; },
      set supergamePlayer(v) { g.supergamePlayer = v; },
      get supergameBasket() { return g.supergameBasket; },
      set supergameBasket(v) { g.supergameBasket = v; },
      get superPrize() { return g.superPrize; },
      set superPrize(v) { g.superPrize = v; },
      get supergameWon() { return g.supergameWon; },
      set supergameWon(v) { g.supergameWon = v; },
      get supergameAtRisk() { return g.supergameAtRisk; },
      set supergameAtRisk(v) { g.supergameAtRisk = v; },
      get superSector() { return g.superSector; },
      set superSector(v) { g.superSector = v; },
      get wheelSuperMode() { return g.wheelSuperMode; },
      set wheelSuperMode(v) { g.wheelSuperMode = v; },
      get resumeAfterSpin() { return g.resumeAfterSpin; },
      set resumeAfterSpin(v) { g.resumeAfterSpin = v; },
      get resumeAtLetterPick() { return g.resumeAtLetterPick as PlayerTurnHost['resumeAtLetterPick']; },
      set resumeAtLetterPick(v) { g.resumeAtLetterPick = v; },
      get resumeAtBoxChosen() { return g.resumeAtBoxChosen; },
      set resumeAtBoxChosen(v) { g.resumeAtBoxChosen = v; },
      get resumeAtLetterOpen() { return g.resumeAtLetterOpen as PlayerTurnHost['resumeAtLetterOpen']; },
      set resumeAtLetterOpen(v) { g.resumeAtLetterOpen = v; },
      setScene: (scene) => g.setScene(scene),
      persistCheckpoint: (checkpoint, award, pick) => g.persistCheckpoint(checkpoint, award, pick),
      drawBoardChrome: () => g.drawBoardChrome(),
      drawFortuneWheel: (a) => g.drawFortuneWheel(a),
      paintSeatSprite: (i, id) => g.paintSeatSprite(i, id),
      paintScore: (i) => g.paintScore(i),
      paintWordBoard: () => g.paintWordBoard(),
      paintAlphabetRow: () => g.paintAlphabetRow(),
      paintYakubovichStudio: () => g.paintYakubovichStudio(),
      hideWheel: () => g.hideWheel(),
      syncPlayers: (v) => g.syncPlayers(v ?? true),
      syncHud: (v?: boolean, blink?: { seat: number; on: boolean }) => g.syncHud(v ?? true, blink),
      syncAlphabet: (v) => g.syncAlphabet(v ?? true),
      syncBoard: (v, revealed, openBefore) => g.syncBoard(v ?? true, revealed, openBefore),
      syncDebug: () => g.syncDebug(),
      useSvgPlayers: () => g.useSvgPlayers(),
      isHuman: (i) => g.isHuman(i),
      playerName: (i) => g.playerName(i),
      wordBoardCells: (entry, revealed, openBefore) => g.wordBoardCells(entry, revealed, openBefore),
      snapshotRoundToBackbuf: () => g.snapshotRoundToBackbuf(),
      inSupergameSolve: () => g.inSupergameSolve(),
      spinWheel: () => g.spinWheel(),
      assistantOpenWalk: (stops, openAt, opts) => g.assistantOpenWalk(stops, openAt, opts),
      pickLetter: () => g.pickLetter(),
      openLetter: (idx, n, award) => g.openLetter(idx, n, award),
      assistantRevealRemainingLetters: (opts) => g.assistantRevealRemainingLetters(opts),
      playSfx: (id, options) => g.playSfx(id, options),
      stopSfx: (id) => g.stopSfx(id),
      setSfxVolume: (id, volume) => g.setSfxVolume(id, volume),
      playerSay: (d, s) => g.playerSay(d, s),
      playerDecision: (a, b, c, d, forced, opts) => g.playerDecision(a, b, c, d, forced, opts),
      playerConfirm: (phrase, opts) => g.playerConfirm(phrase, opts),
      updateMoney: (i, from) => g.updateMoney(i, from),
      yakubovichTalk: (a, b) => g.yakubovichTalk(a, b),
      yakubovichReply: (a, b) => g.yakubovichReply(a, b),
      yakubovichSetSilent: () => g.yakubovichSetSilent(),
      delay: (ms) => g.delay(ms),
      waitKey: (ms) => g.waitKey(ms),
      random: (n) => g.random(n),
      len: (t) => g.len(t),
    };
  }

  private yakHost(): YakubovichHost {
    const g = this;
    return {
      get screen() { return g.screen; },
      get yak() { return g.ctx.yak; },
      get audio() { return g.m.audio; },
      get tts() { return g.ctx.tts; },
      delay: (ms) => g.delay(ms),
      waitKey: (ms) => g.waitKey(ms),
      random: (n) => g.random(n),
    };
  }

  private presentationHost(): PlayerPresentationHost {
    const g = this;
    return {
      get screen() { return g.screen; },
      get input() { return g.m.input; },
      get audio() { return g.m.audio; },
      get hud() { return g.ctx.hud; },
      get players() { return g.ctx.players; },
      get tts() { return g.ctx.tts; },
      get seats() { return g.seats; },
      get curPlayer() { return g.curPlayer; },
      isHuman: (i) => g.isHuman(i),
      useSvgPlayers: () => g.useSvgPlayers(),
      spriteBox: (i, w) => g.spriteBox(i, w),
      talkSide: (i) => g.talkSide(i),
      paintSeatSprite: (i, id) => g.paintSeatSprite(i, id),
      paintScore: (i) => g.paintScore(i),
      syncHud: (v) => g.syncHud(v),
      setMoneyRecount: (show, jitter) => {
        g.moneyShowScore = show;
        g.moneyJitter = jitter;
      },
      currentPlayerVoice: () => {
        const seat = g.seats[g.curPlayer]!;
        return playerVoiceRole(seat.spriteId, decodeCp866(seat.nameBytes), g.isHuman(g.curPlayer));
      },
      yakubovichSetSilent: () => g.yakubovichSetSilent(),
      delay: (ms) => g.delay(ms),
      waitKey: (ms) => g.waitKey(ms),
      random: (n) => g.random(n),
      len: (t) => g.len(t),
    };
  }

  private async yakubovichSetSilent(): Promise<void> {
    return runYakubovichSetSilent(this.yakHost());
  }

  /** dpr:511-544. DIFF #21: one spoken line (optional name + continuation). */
  private async yakubovichTalk(line1: string, line2 = ''): Promise<void> {
    return runYakubovichTalk(this.yakHost(), line1, line2);
  }

  /** DIFF #24: beat after the player's answer, then the host reply. */
  private async yakubovichReply(line1: string, line2 = ''): Promise<void> {
    return runYakubovichReply(this.yakHost(), line1, line2);
  }

  /**
   * DIFF #21: every player replica is spoken (letter, drum/word, prize, box).
   * Bubble and TTS start together; we block on Promise.all until both finish.
   * DOS / DIFF #11: only NPC seats get a bubble (fixed 1 s), the human has none.
   */
  private async playerSay(displayText: string, spokenText = displayText): Promise<void> {
    return runPlayerSay(this.presentationHost(), displayText, spokenText);
  }

  /** dpr:560-587. Skip the coin pile when the score did not go up. */
  private async updateMoney(seatIdx: number, fromScore: number): Promise<void> {
    return runUpdateMoney(this.presentationHost(), seatIdx, fromScore);
  }

  /**
   * dpr:589-637. Returns 0 (left option) or 1 (right option).
   * `forced` substitutes the NPC's random(2) when a deviation policy fixes
   * the answer (e.g. NPCs never take the prize) while keeping the full
   * save/restore + setSilent + speech-bubble tail of the original.
   */
  private async playerDecision(
    label1: string,
    label2: string,
    phrase0: string,
    phrase1: string,
    forced?: number,
    opts?: { deferSpeech?: boolean },
  ): Promise<number> {
    return runPlayerDecision(this.presentationHost(), label1, label2, phrase0, phrase1, forced, opts);
  }

  /**
   * Single right-hand yellow choice (DIFF #31). Human confirms with Space;
   * the seat leans right, then speaks the phrase.
   */
  private async playerConfirm(phrase: string, opts?: { deferSpeech?: boolean }): Promise<void> {
    return runPlayerConfirm(this.presentationHost(), phrase, opts);
  }

  // ----------------------------------------------------------------- scenes

  /** dpr:869-947. WEB: SVG splash; click/Space aborts the intro and jumps to the studio. */
  private async splash(): Promise<void> {
    this.setScene('splash');
    this.hideWheel();
    const splash = this.ctx.splash;
    if (!splash) {
      throw new Error('splash view required (SVG scene graph)');
    }
    splash.reset();
    splash.setVisible(true);
    this.playSfx('openingOld');
    this.playSfx('opening');

    const skipIntro = async (timeoutMs: number): Promise<boolean> => {
      if (!(await this.waitKey(timeoutMs))) {
        return false;
      }
      this.stopSfx('opening');
      this.stopSfx('openingOld');
      splash.setVisible(false);
      return true;
    };

    for (let i = 0; i < SPLASH_TIMING.wipeFrames; i += 1) {
      splash.setWipeFrame(i);
      if (await skipIntro(SPLASH_TIMING.wipeFrameMs)) {
        return;
      }
    }
    if (await skipIntro(SPLASH_TIMING.afterWipeMs)) {
      return;
    }

    for (let i = 0; i < SPLASH_TIMING.vLineFrames; i += 1) {
      splash.setVLineFrame(i);
      if (await skipIntro(SPLASH_TIMING.vLineFrameMs)) {
        return;
      }
    }

    const hCols = splashHStripeColumns();
    for (let c = 0; c < hCols.length; c += 1) {
      splash.addHStripeColumn(c);
      if (await skipIntro(SPLASH_TIMING.hStripeFrameMs)) {
        return;
      }
    }

    const vRows = splashVStripeRows();
    for (let r = 0; r < vRows.length; r += 1) {
      splash.addVStripeRow(r);
      if (await skipIntro(SPLASH_TIMING.vStripeFrameMs)) {
        return;
      }
    }

    if (await skipIntro(SPLASH_TIMING.afterStripesMs)) {
      return;
    }
    splash.showLogos();
    if (await skipIntro(SPLASH_TIMING.afterLogosMs)) {
      return;
    }

    for (let i = 1; i <= SPLASH_TITLE_LETTERS.length; i += 1) {
      splash.setTitleLetters(i);
      await this.m.audio.sound(i * SPLASH_TIMING.titleBeepStepHz, SPLASH_TIMING.titleBeepMs);
      if (await skipIntro(SPLASH_TIMING.titleLetterMs)) {
        return;
      }
    }

    splash.showCredits();
    if (await skipIntro(INFINITE)) {
      return;
    }
    splash.setVisible(false);
  }

  /** dpr:955-982 — one-time background, bricks, lamps, character shuffle. */
  private drawStaticBackground(): void {
    this.ctx.splash?.setVisible(false);
    const kinds = restoredBrickKinds();
    for (let i = BRICK_COUNT - 1; i >= 0; i -= 1) {
      kinds[i] = this.random(3);
    }
    this.paintStudioWalls(kinds);

    const chars = this.characters;
    for (let i = 100; i >= 0; i -= 1) {
      const a = this.random(chars.length);
      const b = this.random(chars.length);
      [chars[a], chars[b]] = [chars[b], chars[a]];
    }
  }

  /** Backdrop fills, brick wall, lamps. Live game randomizes `kinds`; resume uses i%3. */
  private paintStudioWalls(kinds: readonly number[]): void {
    const s = this.screen;
    this.brickKinds = Array.from(kinds);
    if (!this.ctx.studio) {
      s.fillRect(0, 10, SCREEN_W, 3);
      s.fillRect(0x320 * 8, 2, SCREEN_W, 8);
      s.fillRect(0x410 * 8, 0x5e, SCREEN_W, 1);
      s.fillRect(0x21c0 * 8, 2, SCREEN_W, 8);
      s.fillRect(0x6770 * 8, 1, SCREEN_W, 8);
      for (let i = BRICK_COUNT - 1; i >= 0; i -= 1) {
        s.drawSprite(
          SPRITE.BRICK1 + kinds[i],
          (i % 12) * 52 + 5 + (Math.floor(i / 12) * 31 + 15) * SCREEN_W,
          1,
        );
      }
      s.drawSprite(SPRITE.LAMP, 69 + 3 * SCREEN_W, 1);
      s.drawSprite(SPRITE.LAMP, 559 + 3 * SCREEN_W, 1);
    }
    this.syncStudio(true);
  }

  /** dpr:990-1037 */
  private async stageSetup(): Promise<void> {
    return await runStageSetup(this.flowHost());
  }


  /** dpr:1040-1087 — sprite first, then caption blink, then name (web order). */
  private async presentation(): Promise<void> {
    return await runPresentation(this.flowHost());
  }


  /** dpr:1091-1115 — announce theme; blanks were painted in stageSetup. */
  private async selectWord(): Promise<void> {
    return await runSelectWord(this.flowHost());
  }


  /** dpr:1229-1244. DIFF #26: friction spin, random 1.1–2.5 turns (super-game 3.2–5.5). */
  private async spinWheel(): Promise<void> {
    const g = this;
    const result = await spinDrum(
      {
        get audio() { return g.m.audio; },
        get audioBuf() { return g.audioBuf; },
        get wheel() { return g.ctx.wheel; },
        playSfx: (id, options) => g.playSfx(id, options),
        stopSfx: (id) => g.stopSfx(id),
        delay: (ms) => g.delay(ms),
        random: (n) => g.random(n),
        drawFortuneWheel: (sector) => g.drawFortuneWheel(sector),
        syncDebug: () => g.syncDebug(),
      },
      this.curSector,
      { superMode: this.wheelSuperMode },
    );
    this.curSector = result.curSector;
    if (result.superSector !== undefined) {
      this.superSector = result.superSector;
    }
  }

  private inSupergameSolve(): boolean {
    return this.ctx.state.scene === 'supergame-solve';
  }

  /** dpr:1366-1396 — pick a letter from the alphabet row. Returns letter index 0..31. */
  private async pickLetter(): Promise<number> {
    return await runPickLetter(this.flowHost());
  }



  /**
   * Assistant card-open walk: enter from the RIGHT, open stops RIGHT→LEFT,
   * then after the last needed card exit back to the RIGHT (not across to the left).
   * `stops` is left→right; the walker opens the rightmost first.
   */
  private async assistantOpenWalk(
    stops: readonly AssistStop[],
    openAtStop: (stop: AssistStop) => void,
    opts?: AssistantWalkOptions,
  ): Promise<void> {
    await runAssistantOpenWalk(
      {
        screen: this.screen,
        assist: this.ctx.assist,
        audio: this.m.audio,
        playSfx: (id) => this.playSfx(id),
        waitKey: (ms) => this.waitKey(ms),
        delay: (ms) => this.delay(ms),
        random: (n) => this.random(n),
      },
      stops,
      openAtStop,
      opts,
    );
  }


  /**
   * dpr:1398-1497 — open the chosen letter. `letterIdx` 0..31; `n` is the
   * 1-based word position for the ПЛЮС sector, else 0. DIFF #26: TV scoring
   * adds unit×hits, doubles, or leaves the score unchanged.
   */
  private async openLetter(
    letterIdx: number,
    n: number,
    award: LetterAward,
  ): Promise<boolean> {
    return await runOpenLetter(this.flowHost(), letterIdx, n, award);
  }


  /**
   * One player's turn (dpr:1120-1500). Returns:
   * 'again' — same player continues; 'next' — pass the turn;
   * 'won' — round solved by the current player.
   */
  private async takeTurn(): Promise<'again' | 'next' | 'won'> {
    return await runTakeTurn(this.flowHost());
  }


  /**
   * dpr:1501-1514. Returns false when every seat is removed (→ adware path).
   */
  private async nextPlayer(): Promise<boolean> {
    return await runNextPlayer(this.flowHost());
  }


  /** dpr:1521-1554. DIFF #19: plaque is an SVG overlay over Yakubovich. */
  private async adware(): Promise<void> {
    return await runAdware(this.flowHost());
  }


  /** DIFF #31: post-finals supergame for the tournament winner. */
  private async supergame(): Promise<void> {
    return await runSupergame(this.flowHost());
  }


  /**
   * Walk the assistant from the right, open every still-closed letter right→left,
   * then exit back to the right (same cadence as openLetter, no scoring/sting).
   */
  private async assistantRevealRemainingLetters(opts?: { leadInMs?: number }): Promise<void> {
    return await runAssistantRevealRemainingLetters(this.flowHost(), opts);
  }


  /** dpr:1558-1646. WEB: CeremonyView stage + top-8 rise via animateFrames. */
  private async endgame(): Promise<void> {
    const seat = this.seats[this.curPlayer]!;
    const name = decodeCp866(seat.nameBytes);
    this.hideWheel();

    const ceremony = this.ctx.ceremony;
    if (!ceremony) {
      throw new Error('ceremony view required (SVG scene graph)');
    }

    if (this.winner < 3) {
      this.setScene('endgame');
      this.hideWheel();
      this.playSfx('fanfare');

      const line1 = `Товарищ ${name}!`;
      const line2 = this.supergameWon === true
        ? `Вы выиграли СУПЕР-ИГРУ и суперприз — ${this.superPrize}!`
        : this.supergameWon === false
          ? `Вы набрали ${seat.score} очков. Призы на кон сгорели.`
          : this.supergameBasket.length > 0
            ? `Вы забрали призы на ${basketTotal(this.supergameBasket)} рублей и набрали ${seat.score} очков!`
            : `Вы выиграли в ФИНАЛЕ и набрали ${seat.score} очков!`;

      const L = ENDGAME_LAYOUT;
      const lines: CeremonyLine[] = [
        { text: line1, ...L.greeting },
        { text: line2, ...L.summary },
      ];
      if (this.supergameWon === true || (this.supergameWon === null && this.supergameBasket.length > 0)) {
        const basketLine = this.supergameWon === true
          ? `Плюс суперприз: ${this.superPrize}`
          : 'Ваши призы:';
        lines.push({ text: basketLine, ...L.body });
        let prizeY = L.body.y + L.prizeLineStep;
        for (const item of this.supergameBasket.slice(0, 4)) {
          lines.push({ text: `• ${item.name} — ${item.rubles} руб.`, x: L.body.x, y: prizeY });
          prizeY += L.prizeLineStep;
        }
      } else {
        lines.push({ text: 'Торговый дом ТУСАР и ПОЛЕ ЧУДЕС дарит Вам', ...L.body });
        const prize = `${PRIZES[this.random(PRIZES.length)]} компании PROCTER & GAMBLE!`;
        lines.push({ text: prize, ...L.giftPrize });
      }
      lines.push(
        { text: 'За ПРИЗОМ обращайтесь по адресу:', ...L.addressHeader },
        { text: '101000-Ц, Москва, проезд Серова, 11', ...L.addressLine },
        { text: 'На конверте сделайте пометку КОМПЬЮТЕРНЫЙ ПРИЗ', ...L.addressNote },
        { text: 'Автор Дима Башуров из Российского Федерального Ядерного Центра', ...L.author, color: 8 },
        { text: 'Телефон в Арзамасе-16 : (831-30) 5-92-73   E-mail: 0669 @ RFNC. NNOV. SU', ...L.authorContact, color: 8 },
      );
      ceremony.showStage(lines);
      this.ctx.yak?.showIdle();

      await this.yakubovichTalk(
        this.supergameWon === true
          ? 'Вы выиграли супер-игру!'
          : 'Поздравляю! Вы выиграли финал!',
      );
      await this.waitKey(INFINITE);
      await this.yakubovichSetSilent();
    }

    // Top-8 update — session-only (the original rewrote POLE.PIC, dpr:1591-1609).
    this.setScene('top-players');
    const top = this.ctx.topPlayers;
    let inserted = 8;
    for (let i = 0; i < 8; i += 1) {
      if ((top[i]?.score ?? 0) < seat.score) {
        top.splice(i, 0, { name: decodeCp866(seat.nameBytes.subarray(0, 10)), score: seat.score & 0xffff });
        top.length = Math.min(top.length, 8);
        inserted = i;
        break;
      }
    }

    const rows = [];
    for (let i = 0; i < 8; i += 1) {
      const entry = top[i] ?? { name: '', score: 0 };
      rows.push({
        rank: `${i} ${entry.name}`, // 0-based ranks, as in the original (dpr:1623)
        score: `${entry.score}$`,
        highlight: i === inserted,
      });
    }
    ceremony.showTop8(rows);
    this.ctx.yak?.setVisible(false);

    await animateFrames({
      frameCount: TOP8_I0 + 1,
      delayMs: (frame) => TOP8_I0 - frame,
      onFrame: async (frame) => {
        const i = TOP8_I0 - frame;
        ceremony.setTop8Rise(i);
        await this.m.audio.sound(20 + frame * 20, 10);
      },
      delay: (ms) => this.delay(ms),
    });
    await this.waitKey(INFINITE);
    ceremony.setVisible(false);
    this.setScene('done');
    this.ctx.persist?.clear();
  }

  // ------------------------------------------------------------------- run

  async run(): Promise<void> {
    const resume = this.ctx.resume;
    if (resume) {
      this.applyResume(resume);
      this.paintRestoredStudio();
      if (this.skipToTurns) {
        this.snapshotRoundToBackbuf();
        this.setScene('turn');
      }
    } else {
      await this.splash();
      this.drawStaticBackground();

      this.charId = 0;
      this.curSector = 0;
      this.winner = 3;
      this.stage = 0;
    }

    if (this.ctx.options?.skipToSupergame && !resume) {
      // DIFF #31: local QA shortcut — seed a human finalist and open super-game.
      const seatIdx = this.humanSeats >= 1 ? 1 : 0;
      this.winner = seatIdx;
      this.curPlayer = seatIdx;
      this.stage = TOURNAMENT_ROUNDS;
      for (let i = 0; i <= 2; i += 1) {
        if (i === seatIdx) {
          this.seats[i] = {
            spriteId: SPRITE.PLAYER,
            nameBytes: encodeCp866('ИГРОК'),
            score: 10_000,
          };
        } else {
          this.seats[i] = { spriteId: null, nameBytes: new Uint8Array(0), score: 0 };
        }
      }
      this.paintSeatSprite(seatIdx, SPRITE.PLAYER);
      this.syncPlayers(true);
      this.syncHud(true);
      this.syncDebug();
      await this.supergame();
      await this.endgame();
      return;
    }

    // Stage loop (dpr:989-1556).
    do {
      if (!this.skipToTurns) {
        await this.stageSetup();
        await this.presentation();
        await this.selectWord();

        this.curPlayer = 0;
        this.movesForBox = 0;
      }
      this.skipToTurns = false;
      let allRemoved = false;

      if (this.resumeAtRoundWon) {
        // Restored from 'word-solved' checkpoint: word already named, skip turn
        // loop and round-end ceremony — winner is already set from applyResume.
        if (this.winner >= 3) {
          this.winner = this.curPlayer;
        }
        this.resumeAtRoundWon = false;
      } else {
        let roundWon = false;

        // Turn loop (dpr:1120-1515).
        while (this.remaindLetters > 0) {
          this.persistCheckpoint('in-round');
          const outcome = await this.takeTurn();
          if (outcome === 'won') {
            roundWon = true;
            break;
          }
          if (this.remaindLetters > 0) {
            this.persistCheckpoint('in-round');
          }
          if (outcome === 'next') {
            if (!(await this.nextPlayer())) {
              allRemoved = true;
              break;
            }
            this.persistCheckpoint('in-round');
          }
          this.syncDebug();
        }

        if (!allRemoved) {
          this.setScene('round-end');
          // wordCorrect already started on a whole-word guess — do not restart
          // the same sting as winnerTour, and do not cut the playing cue.
          if (!roundWon) {
            this.playSfx('winnerTour');
          }
          await this.yakubovichTalk(this.playerName(this.curPlayer), 'выиграл раунд!');
          await this.waitKey(1000);
          this.winner = this.curPlayer;
        }
      }

      await this.adware();
      this.stage += 1;
      if (this.stage < TOURNAMENT_ROUNDS) {
        this.guessedWord = new Uint8Array(0);
        this.opened = [];
        this.remaindLetters = 0;
        this.persistCheckpoint('between-rounds');
      }
    } while (this.stage < TOURNAMENT_ROUNDS);

    await this.supergame();
    await this.endgame();
  }
}

/** Run one full game (splash → finale). Rejects on abort. */
export async function runGame(ctx: GameContext): Promise<void> {
  await new Game(ctx).run();
}
