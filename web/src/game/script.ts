import type { OvlQuestion } from '../assets/ovl';
import type { TopPlayerRecord } from '../assets/pic';
import { decodeCp866, encodeCp866 } from '../encoding/cp866';
import type { Machine } from '../engine/types';
import { BACKBUF, BACKBUF2, INFINITE, SCREEN_W } from '../engine/types';
import type { HostTts, TtsRole } from '../engine/tts';
import { hostSpeechText, spokenCasing } from '../engine/tts';
import { PLAYERS_ENTER_UNDER_HOST, PLAYERS_ENTER_VOLUME, type GameSfx, type SfxId, type SfxPlayOptions } from '../engine/sfx';
import { defaultAssetSpec } from '../spec';
import {
  CHARACTERS,
  DECISION_ANIM,
  FEMALE_CHARACTER_SPRITES,
  MONEY_VALUES,
  PRIZES,
  SEATS,
  STAGE_NAMES,
  SUPERGAME_BANNER,
  TOURNAMENT_ROUNDS,
  liveSeat,
} from './constants';
import { PROGRESS_VERSION, type GameProgressSave } from './persist';
import type { AlphabetView } from './svgAlphabet';
import type { BoardView, BoardWordCell } from './svgBoard';
import type { HudView, SpriteBox } from './svgHud';
import type { AssistView } from './svgAssist';
import type { HandView } from './svgHand';
import type { AdwareView } from './svgAdware';
import type { YakView } from './svgYakubovich';
import type { BoxesView } from './svgBoxes';
import { boxBringIn, boxClosedPair, boxReveal } from './svgBoxes';
import type { PlayersView } from './svgPlayers';
import type { PlayPresenter } from '../engine/screen';
import type { StudioView } from './svgStudio';
import {
  ASSIST_WALK_X0,
  ASSIST_WALK_X1,
  ASSIST_WALK_Y,
  BRICK_COUNT,
  restoredBrickKinds,
} from './svgStudio';
import type { WheelView } from './svgWheel';
import type { SupergameHudView } from './svgSupergameHud';
import { firstTourGreeting, firstTourInvite, laterTourGreeting, laterTourInvite, broadcastWeekday, supergameGreeting, supergamePrizeIntro } from './hostIntro';
import { buildPrizeBasket, basketTotal, type SupergamePrize } from './supergamePrizes';
import { superWheelPrizes } from './superWheel';
import {
  spinEase,
  spinMilliturns,
  spinStepsFromMilliturns,
  SPIN_DURATION_JITTER_MS,
  SPIN_DURATION_MS,
  SPIN_FRAME_MS,
  SPIN_HOLD_FULL_MS,
  SPIN_MAX_TURNS,
  SPIN_MIN_TURNS,
  WHEEL_SECTOR_COUNT,
  WHEEL_SECTORS,
  WHEEL_STEP_DEG,
} from './tvWheel';

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
const MALE_A_YA_NAMES = new Set(['илья', 'никита', 'савва', 'фома', 'кузьма', 'лука']);

/** Maps a single Cyrillic letter (А–Я) to its spoken name for TTS. */
const LETTER_NAMES: Record<string, string> = {
  'А': 'А', 'Б': 'Бэ', 'В': 'Вэ', 'Г': 'Гэ', 'Д': 'Дэ',
  'Е': 'Е', 'Ж': 'Жэ', 'З': 'Зэ', 'И': 'И', 'Й': 'И краткое',
  'К': 'Ка', 'Л': 'Эль', 'М': 'Эм. Михаил', 'Н': 'Эн. Николай', 'О': '"Оо" - Олег',
  'П': 'Пэ', 'Р': 'Эр', 'С': 'Эс', 'Т': 'Тэ', 'У': 'У',
  'Ф': 'Эф', 'Х': 'Ха', 'Ц': 'Цэ', 'Ч': 'Чэ', 'Ш': 'Ша',
  'Щ': 'Ща', 'Ъ': 'Твёрдый знак', 'Ы': 'Ы', 'Ь': 'Мягкий знак',
  'Э': 'Э оборотное', 'Ю': 'Ю', 'Я': 'Я',
};

function letterName(ch: string): string {
  return LETTER_NAMES[ch] ?? ch;
}

function letterReplica(ch: string, n: number): { display: string; spoken: string } {
  if (n === 0) {
    return { display: `Буква ${ch}`, spoken: `Буква - ${letterName(ch)}` };
  }
  const line = `${n}-я буква`;
  return { display: line, spoken: line };
}

export function playerVoiceRole(spriteId: number | null, name: string, human: boolean): TtsRole {
  if (spriteId !== null && FEMALE_CHARACTER_SPRITES.has(spriteId)) {
    return 'female';
  }
  if (human) {
    const n = name.trim().toLocaleLowerCase('ru-RU');
    if (n.length > 0 && /[ая]$/.test(n) && !MALE_A_YA_NAMES.has(n)) {
      return 'female';
    }
  }
  return 'male';
}

const MONEY_RECOUNT_TICK_MS = 2;
const MONEY_RECOUNT_MAX_MS = 1000;

/** How many coins share one original 2 ms tick — capped at 1 s total. */
export function moneyRecountStride(score: number): number {
  if (score <= 1) {
    return 1;
  }
  const maxTicks = Math.max(1, Math.floor(MONEY_RECOUNT_MAX_MS / MONEY_RECOUNT_TICK_MS));
  return Math.max(1, Math.ceil(score / maxTicks));
}

export type Scene =
  | 'splash'
  | 'stage-setup'
  | 'presentation'
  | 'word-select'
  | 'turn'
  | 'word-solve'
  | 'letter-pick'
  | 'letter-open'
  | 'box-game'
  | 'prize'
  | 'adware'
  | 'round-end'
  | 'supergame-setup'
  | 'supergame-prizes'
  | 'supergame-choice'
  | 'supergame-spin'
  | 'supergame-letters'
  | 'supergame-think'
  | 'supergame-solve'
  | 'endgame'
  | 'top-players'
  | 'done';

export interface SeatDebug {
  name: string;
  score: number;
  isHuman: boolean;
  removed: boolean;
}

/** Mutable snapshot consumed by window.__poleDebug and the smoke harness. */
export interface GameDebugState {
  scene: Scene;
  stage: number;
  currentPlayer: number;
  currentSector: number;
  word: string;
  theme: string;
  opened: boolean[];
  usedLetters: string[];
  seats: SeatDebug[];
  winner: number;
  movesForBox: number;
  supergame?: {
    basket: SupergamePrize[];
    superPrize: string;
    atRisk: boolean;
    won: boolean | null;
  };
}

export interface GameOptions {
  /**
   * Seats offered to humans. 1 (default web mode): only seat 2 ('2-ой ИГРОК')
   * is prompted, and an empty name keeps it HUMAN with the default name
   * «ИГРОК» — guaranteeing the 1-player + 2-NPC setup. 2 (original
   * behavior): seats 2 and 3 are both prompted and an empty name hands the
   * seat to an NPC (dpr:1055-1078 + Delphi deviation #2).
   */
  humanSeats: 1 | 2;
  /**
   * DIFF #31: skip the 7 tournament stages and jump straight to the
   * super-game with a seeded human winner (URL `?supergame=1`).
   */
  skipToSupergame?: boolean;
}

export interface GameContext {
  machine: Machine;
  /** Live, session-edited question list (admin panel edits apply immediately). */
  questions: readonly OvlQuestion[];
  /** Session top-8 list, mutated in place. Mid-game resume also writes it (DIFF #20). */
  topPlayers: TopPlayerRecord[];
  state: GameDebugState;
  /** Omitted → the web default: 1 human + 2 NPCs. */
  options?: GameOptions;
  /** SVG drum overlay (DIFF #19). */
  wheel?: WheelView;
  /** SVG stage banner, word tiles (DIFF #19). */
  board?: BoardView;
  /** SVG assistant over the board hole (DIFF #19). */
  assist?: AssistView;
  /** SVG Yakubovich base + mouth/eyes (DIFF #19). */
  yak?: YakView;
  /** SVG brick wall, lamps and side columns (DIFF #19). */
  studio?: StudioView;
  /** SVG шкатулки over the player (DIFF #19). */
  boxes?: BoxesView;
  /** SVG commercial-break plaque over the host (DIFF #19). */
  adware?: AdwareView;
  /** SVG alphabet strip (DIFF #19). */
  alphabet?: AlphabetView;
  /** SVG nameplates, money stacks, speech bubbles (DIFF #19). */
  hud?: HudView;
  /** SVG player / NPC seat sprites + decision lean (DIFF #19). */
  players?: PlayersView;
  /** localStorage checkpoint (DIFF #20). */
  persist?: {
    save(snapshot: GameProgressSave): void;
    clear(): void;
  };
  /** When set, splash is skipped and the round is restored. */
  resume?: GameProgressSave;
  /** Host + player TTS (DIFF #21). Tests omit this and keep PWM mumble + the 1 s NPC bubble wait. */
  tts?: HostTts;
  /** TV-show samples (DIFF #25). Tests omit this and keep PWM. */
  sfx?: GameSfx;
  /** SVG pointing hand (alphabet row + board). Tests omit and keep canvas HAND. */
  hand?: HandView;
  /** Browser presenter: SVG studio vs legacy-canvas splash/prize/endgame. */
  present?: PlayPresenter;
  /** Supergame prize list + think timer (DIFF #31). */
  supergameHud?: SupergameHudView;
}

interface Seat {
  /** null = removed from the round (the original's Sprite.ptr = nil). */
  spriteId: number | null;
  nameBytes: Uint8Array;
  score: number;
}

export function createDebugState(): GameDebugState {
  return {
    scene: 'splash',
    stage: 0,
    currentPlayer: 0,
    currentSector: 0,
    word: '',
    theme: '',
    opened: [],
    usedLetters: [],
    seats: [],
    winner: 3,
    movesForBox: 0,
  };
}

class Game {
  private readonly m: Machine;
  private readonly ctx: GameContext;
  private readonly seats: Seat[] = SEATS.map(() => ({ spriteId: null, nameBytes: new Uint8Array(0), score: 0 }));
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
  /** Hold length on «Кручу барабан» (ms); 0 → random 1.1–2.5 turns. */
  private spinHoldMs = 0;

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
    const legacy =
      scene === 'splash' ||
      scene === 'prize' ||
      scene === 'endgame' ||
      scene === 'top-players' ||
      scene === 'done';
    this.ctx.present?.setMode(legacy ? 'legacy' : 'svg');
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

  private letterIndexAtAssist(assistOfs: number): number {
    const assistStandShift = ((25 - 16) >> 1);
    const cellOfs = assistOfs + assistStandShift + 11 * SCREEN_W;
    return (cellOfs - this.wordPos - 11 * SCREEN_W) >> 4;
  }

  private wordBoardCells(
    entryBytes?: Uint8Array,
    revealedDuringWalk?: ReadonlySet<number>,
    openBeforeWalk?: ReadonlySet<number>,
  ): BoardWordCell[] {
    const len = this.guessedWord.length;
    const cells: BoardWordCell[] = [];
    for (let i = 0; i < len; i += 1) {
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

  private syncAlphabet(visible = true): void {
    const alphabet = this.ctx.alphabet;
    if (!alphabet) {
      return;
    }
    alphabet.setAvailable(this.available);
    alphabet.setVisible(visible);
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

  /** SVG seats whenever the overlay exists, except the prize framebuffer scene. */
  private useSvgPlayers(): boolean {
    return Boolean(this.ctx.players) && this.ctx.state.scene !== 'prize';
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
    pick?: { letterIdx: number; plusPosition?: number },
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
        pickedLetterIdx: pick.letterIdx,
        ...(pick.plusPosition !== undefined && { plusPosition: pick.plusPosition }),
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
      save.checkpoint === 'word-solved';
    this.resumeAfterSpin = save.checkpoint === 'after-spin';
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
    const alphabet = this.ctx.alphabet;
    if (alphabet) {
      this.syncAlphabet(true);
      return;
    }
    const s = this.screen;
    let j = 332 * SCREEN_W + 31 * 20;
    for (let i = 31; i >= 0; i -= 1) {
      s.drawSprite(SPRITE.LETTER_BACK0, j, 8);
      if (this.available[i] === 0x20) {
        s.fillRect(0x14c * SCREEN_W + i * 20, 18, 19, 7);
      }
      j -= 20;
    }
    s.print(this.available, 334 * SCREEN_W + 4, 0, 14, 20);
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
  private async yakubovichSetSilent(): Promise<void> {
    const s = this.screen;
    if (!this.ctx.yak) {
      s.screenCopy(161, 40, 0x164df, BACKBUF + 0x164df);
    }
    await this.m.audio.speechSound();
    this.yakubovichShowIdle();
  }

  /** Studio rest pose: closed mouth, open eyes (same sprites as setSilent). */
  private yakubovichShowIdle(): void {
    const yak = this.ctx.yak;
    if (yak) {
      yak.showIdle();
      return;
    }
    const s = this.screen;
    s.drawSprite(SPRITE.YAKUBOVICH_PASSIVE, 0x1ff + 0xad * SCREEN_W, 16);
    s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, 0xd1 * SCREEN_W + 0x214, 16);
  }

  /** dpr:511-544. DIFF #21: one spoken line (optional name + continuation). */
  private async yakubovichTalk(line1: string, line2 = ''): Promise<void> {
    const spoken = hostSpeechText(line1, line2);
    const speech = this.ctx.tts?.speak(spoken) ?? null;
    if (!speech) {
      await this.yakubovichMouthAnimation();
      this.yakubovichShowIdle();
      return;
    }
    await speech.started;
    await this.yakubovichMouthUntil(speech.ended);
    this.yakubovichShowIdle();
  }

  /** DIFF #24: beat after the player's answer, then the host reply. */
  private async yakubovichReply(line1: string, line2 = ''): Promise<void> {
    await this.waitKey(700);
    await this.yakubovichTalk(line1, line2);
  }

  /** Keep the jaw moving until `ended` resolves, then close the eyes. */
  private async yakubovichMouthUntil(ended: Promise<void>): Promise<void> {
    const s = this.screen;
    const yak = this.ctx.yak;
    const eyesLow = 0x214 + 0xd1 * SCREEN_W;
    const eyesHigh = 0x214 + 0xc9 * SCREEN_W;
    const body = 0x1ff + 0xad * SCREEN_W;
    let done = false;
    const mark = ended.then(() => {
      done = true;
    });

    if (yak) {
      yak.setPose('active', 'close', true);
    } else {
      s.drawSprite(SPRITE.YAKUBOVICH_ACTIVE, body, 16);
      s.drawSprite(SPRITE.YAKUBOVICH_EYES_CLOSE, eyesHigh, 16);
    }
    while (!done) {
      if (yak) {
        yak.setPose('passive', 'open', false);
      } else {
        s.drawSprite(SPRITE.YAKUBOVICH_PASSIVE, body, 16);
        s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, eyesLow, 16);
      }
      await this.delay(120);
      if (done) {
        break;
      }
      if (yak) {
        yak.setPose('active', 'close', true);
      } else {
        s.drawSprite(SPRITE.YAKUBOVICH_ACTIVE, body, 16);
        s.drawSprite(SPRITE.YAKUBOVICH_EYES_CLOSE, eyesHigh, 16);
      }
      await this.delay(180);
    }
    await mark;
    if (!this.ctx.yak) {
      s.screenCopy(161, 40, BACKBUF + 0x164df, 0x164df);
    }
    this.yakubovichShowIdle();
  }

  /** Mouth/eye cycle from DrawYakubovichTalk (dpr:511-544), without the bubble. */
  private async yakubovichMouthAnimation(): Promise<void> {
    const s = this.screen;
    const yak = this.ctx.yak;
    const eyesLow = 0x214 + 0xd1 * SCREEN_W;
    const eyesHigh = 0x214 + 0xc9 * SCREEN_W;
    const body = 0x1ff + 0xad * SCREEN_W;

    await this.m.audio.speechSound();
    if (yak) {
      yak.setPose('passive', 'close', false);
    } else {
      s.drawSprite(SPRITE.YAKUBOVICH_EYES_CLOSE, eyesLow, 16);
    }
    await this.delay(200);
    if (yak) {
      yak.setPose('passive', 'open', false);
    } else {
      s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, eyesLow, 16);
    }
    await this.delay(150);
    if (yak) {
      yak.setPose('passive', 'close', false);
    } else {
      s.drawSprite(SPRITE.YAKUBOVICH_EYES_CLOSE, eyesLow, 16);
    }
    await this.delay(150);
    if (yak) {
      yak.setPose('active', 'close', true);
    } else {
      s.drawSprite(SPRITE.YAKUBOVICH_ACTIVE, body, 16);
      s.drawSprite(SPRITE.YAKUBOVICH_EYES_CLOSE, eyesHigh, 16);
    }

    for (let i = 2; i >= 0; i -= 1) {
      await this.m.audio.speechSound();
      if (yak) {
        yak.setPose('passive', 'open', false);
      } else {
        s.drawSprite(SPRITE.YAKUBOVICH_PASSIVE, body, 16);
        s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, eyesLow, 16);
      }
      await this.delay(this.random(2) * 200 + 100);
      if (yak) {
        yak.setPose('active', 'close', true);
      } else {
        s.drawSprite(SPRITE.YAKUBOVICH_ACTIVE, body, 16);
      }
      await this.delay(this.random(2) * 50 + 100);
    }

    if (!this.ctx.yak) {
      s.screenCopy(161, 40, BACKBUF + 0x164df, 0x164df);
    }
    await this.m.audio.speechSound();
    this.yakubovichShowIdle();
  }

  private currentPlayerVoice(): TtsRole {
    const seat = this.seats[this.curPlayer];
    return playerVoiceRole(seat.spriteId, decodeCp866(seat.nameBytes), this.isHuman(this.curPlayer));
  }

  private showPlayerBubble(text: string): void {
    const hud = this.ctx.hud;
    if (hud) {
      hud.showTalk(this.spriteBox(this.curPlayer), text, this.talkSide(this.curPlayer));
      return;
    }
    const bubbleOfs = liveSeat(this.curPlayer).talkBubbleOfs;
    const s = this.screen;
    s.screenCopy(84, 39, BACKBUF2, bubbleOfs);
    s.drawSprite(SPRITE.SPEECH_BUBBLE2, bubbleOfs, 2);
    s.print(text, bubbleOfs + 8 * SCREEN_W + 44 - (this.len(text) << 2), 0, 14, 8);
  }

  private hidePlayerBubble(): void {
    if (this.ctx.hud) {
      this.ctx.hud.hideBubbles();
      return;
    }
    const bubbleOfs = liveSeat(this.curPlayer).talkBubbleOfs;
    this.screen.screenCopy(84, 39, bubbleOfs, BACKBUF2);
  }

  /**
   * DIFF #21: every player replica is spoken (letter, drum/word, prize, box).
   * Bubble and TTS start together; we block on Promise.all until both finish.
   * DOS / DIFF #11: only NPC seats get a bubble (fixed 1 s), the human has none.
   */
  private async playerSay(displayText: string, spokenText = displayText): Promise<void> {
    const spoken = spokenCasing(spokenText);
    if (spoken.length === 0) {
      return;
    }
    const speech = this.ctx.tts?.speak(spoken, this.currentPlayerVoice()) ?? null;
    const showBubble = !this.isHuman(this.curPlayer);
    const voiceDone = speech?.ended ?? Promise.resolve();
    const bubbleDone = showBubble
      ? (async () => {
          this.showPlayerBubble(displayText);
          await this.waitKey(1000);
          this.hidePlayerBubble();
        })()
      : Promise.resolve();
    await Promise.all([voiceDone, bubbleDone]);
  }

  /** Blank a used alphabet tile cell. */
  private clearAlphabetCell(letterIdx: number): void {
    if (this.ctx.alphabet) {
      this.ctx.alphabet.setVanishFrame(letterIdx, 3);
      return;
    }
    this.screen.fillRect(0x14c * SCREEN_W + letterIdx * 20, 18, 19, 7);
  }

  /** dpr:1410-1424 — lift the used letter off the alphabet row. */
  private async vanishAlphabetTile(letterIdx: number): Promise<void> {
    const s = this.screen;
    const cell = 0x14c * SCREEN_W + letterIdx * 20;
    const svg = this.ctx.alphabet;
    for (let i = 0; i <= 3; i += 1) {
      if (svg) {
        svg.setVanishFrame(letterIdx, i);
      } else if (i < 3) {
        s.drawSprite(SPRITE.LETTER_BACK1 + i, cell, 16);
      } else {
        s.fillRect(cell, 18, 19, 7);
      }
      let k = 0;
      for (let j = 1; j <= 10; j += 1) {
        k = this.m.audio.pwm(this.audioBuf, k, i * 0x64 + j * 10 + 0x32, 1);
        k = this.m.audio.pwm(this.audioBuf, k, 0, Math.floor(j / 5) + (i << 2));
      }
      await this.m.audio.playWav(this.audioBuf.subarray(0, k));
    }
  }

  /** dpr:560-587. Skip the coin pile when the score did not go up. */
  private async updateMoney(seatIdx: number, fromScore: number): Promise<void> {
    const seat = this.seats[seatIdx];
    if (seat.score <= fromScore) {
      this.paintScore(seatIdx);
      return;
    }
    const s = this.screen;
    const { moneyOfs } = liveSeat(seatIdx);
    const hud = this.ctx.hud;
    if (!hud) {
      s.fillRect(moneyOfs - 644, 30, 84, 7);
    }
    const delta = seat.score - fromScore;
    const stride = moneyRecountStride(delta);
    let shown = fromScore;
    if (hud) {
      this.moneyShowScore = { seat: seatIdx, score: shown };
      this.moneyJitter = null;
      this.syncHud(true);
    }
    while (shown < seat.score) {
      shown = Math.min(seat.score, shown + stride);
      if (hud) {
        this.moneyShowScore = { seat: seatIdx, score: shown };
        this.moneyJitter = { seat: seatIdx, x: this.random(6) - 2, y: this.random(3) - 1 };
        this.syncHud(true);
      } else {
        const coins = Math.min(stride, seat.score - (shown - stride));
        for (let c = 0; c < coins; c += 1) {
          s.drawSprite(SPRITE.MONEY, moneyOfs + this.random(7) * SCREEN_W - SCREEN_W + this.random(12) - 4, 1);
        }
      }
      const freq = this.random(10) + 50;
      await this.m.audio.sound(freq, MONEY_RECOUNT_TICK_MS, { audible: true });
    }
    this.paintScore(seatIdx);
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
    opts?: { deferSpeech?: boolean; measureHold?: boolean },
  ): Promise<number> {
    const s = this.screen;
    const { input } = this.m;
    const seatIdx = this.curPlayer;
    const { spriteOfs, talkBubbleOfs } = liveSeat(seatIdx);
    const bubbleW = 84;
    const bubbleH = 39;
    const bubbleGap = 4;
    // Seat 1: the 99×83 pose blit covers the left cloud’s tail and leaves the
    // right one intact, so the pair looks vertically skewed. Sit both above the sprite.
    const pairOfs = seatIdx === 1 ? talkBubbleOfs - 20 * SCREEN_W : talkBubbleOfs;
    const rightBubble = pairOfs + bubbleW + bubbleGap;

    const leftText = phrase0.length > 0 ? phrase0 : label1;
    const rightText = phrase1.length > 0 ? phrase1 : label2;
    const hud = this.ctx.hud;
    if (hud) {
      hud.showChoice(this.spriteBox(seatIdx, 99), leftText, rightText);
    } else {
      s.screenCopy(bubbleW * 2 + bubbleGap, bubbleH, BACKBUF2, pairOfs);
      s.drawSprite(SPRITE.SPEECH_BUBBLE2, pairOfs, 2);
      s.print(leftText, pairOfs + 8 * SCREEN_W + 44 - (this.len(leftText) << 2), 0, 14, 8);
      s.drawSprite(SPRITE.SPEECH_BUBBLE2, rightBubble, 2);
      s.print(rightText, rightBubble + 8 * SCREEN_W + 44 - (this.len(rightText) << 2), 0, 14, 8);
    }

    let result = 0;
    if (this.isHuman(seatIdx)) {
      const hand = input.hand;
      hand.min = 0;
      hand.max = 4;
      hand.ofs = 4;
      hand.step = 4;
      let i = 2;
      for (;;) {
        if (i > hand.ofs) {
          i -= 1;
        } else if (i < hand.ofs) {
          i += 1;
        }
        if (this.useSvgPlayers()) {
          this.ctx.players!.setSeat(seatIdx, DECISION_ANIM[i]);
        } else {
          s.fillRect(spriteOfs, 83, 99, 7);
          s.drawSprite(DECISION_ANIM[i], spriteOfs, 2);
        }
        await this.delay(100);
        if (hand.ofs !== 2 && input.pollKeyPressed()) {
          result = hand.ofs >> 2;
          hand.ofs = 2;
        }
        if (i === 2 && hand.ofs === 2) {
          break;
        }
      }
      this.paintSeatSprite(seatIdx);
    } else {
      result = forced ?? this.random(2);
    }

    if (hud) {
      hud.hideBubbles();
    } else {
      s.screenCopy(bubbleW * 2 + bubbleGap, bubbleH, pairOfs, BACKBUF2);
    }
    if (opts?.measureHold && result === 1) {
      this.spinHoldMs = await this.measureActionHold();
    } else {
      this.spinHoldMs = 0;
    }
    await this.yakubovichSetSilent();
    if (!opts?.deferSpeech) {
      await this.playerSay(result === 0 ? phrase0 : phrase1);
    }
    return result;
  }

  /** Space / pointer still down after «Кручу барабан» — extra drum travel. */
  private async measureActionHold(): Promise<number> {
    let holdMs = 0;
    while (this.m.input.actionHeld && holdMs < SPIN_HOLD_FULL_MS) {
      await this.delay(SPIN_FRAME_MS);
      holdMs += SPIN_FRAME_MS;
    }
    return holdMs;
  }

  /**
   * Single right-hand yellow choice (DIFF #31). Human confirms with Space;
   * the seat leans right, then speaks the phrase.
   */
  private async playerConfirm(phrase: string, opts?: { deferSpeech?: boolean; measureHold?: boolean }): Promise<void> {
    const s = this.screen;
    const seatIdx = this.curPlayer;
    const { spriteOfs, talkBubbleOfs } = liveSeat(seatIdx);
    const bubbleW = 84;
    const bubbleH = 39;
    const bubbleOfs = (seatIdx === 1 ? talkBubbleOfs - 20 * SCREEN_W : talkBubbleOfs) + bubbleW + 4;
    const hud = this.ctx.hud;
    if (hud) {
      hud.showSingleChoice(this.spriteBox(seatIdx, 99), phrase);
    } else {
      s.screenCopy(bubbleW, bubbleH, BACKBUF2, bubbleOfs);
      s.drawSprite(SPRITE.SPEECH_BUBBLE2, bubbleOfs, 2);
      s.print(phrase, bubbleOfs + 8 * SCREEN_W + 44 - (this.len(phrase) << 2), 0, 14, 8);
    }

    if (this.useSvgPlayers()) {
      this.ctx.players!.setSeat(seatIdx, DECISION_ANIM[4]);
    } else {
      s.fillRect(spriteOfs, 83, 99, 7);
      s.drawSprite(DECISION_ANIM[4], spriteOfs, 2);
    }

    if (this.isHuman(seatIdx)) {
      await this.waitKey(INFINITE);
    } else {
      await this.delay(900);
    }

    if (hud) {
      hud.hideBubbles();
    } else {
      s.screenCopy(bubbleW, bubbleH, bubbleOfs, BACKBUF2);
    }
    this.paintSeatSprite(seatIdx);
    this.spinHoldMs = opts?.measureHold ? await this.measureActionHold() : 0;
    await this.yakubovichSetSilent();
    if (!opts?.deferSpeech) {
      await this.playerSay(phrase);
    }
  }

  // ----------------------------------------------------------------- scenes

  /** dpr:869-947. WEB: click/Space aborts the intro and jumps to the studio. */
  private async splash(): Promise<void> {
    this.setScene('splash');
    this.hideWheel();
    this.playSfx('openingOld');
    this.playSfx('opening');
    const s = this.screen;

    const skipIntro = async (timeoutMs: number): Promise<boolean> => {
      if (!(await this.waitKey(timeoutMs))) {
        return false;
      }
      this.stopSfx('opening');
      this.stopSfx('openingOld');
      return true;
    };

    let j = 0x159 * SCREEN_W + 20;
    let k = 0x26c - 20;
    for (let i = 0; i <= 0xa0; i += 1) {
      s.fillChar(j, k, 7);
      j -= 639;
      k -= 2;
      if (await skipIntro(10)) {
        return;
      }
    }
    if (await skipIntro(500)) {
      return;
    }

    j = 185 * SCREEN_W + 180;
    k = 280;
    for (let i = 0; i <= 0xa0; i += 1) {
      s.fillChar(j, k, 7);
      s.line(20, 345, 180 - i, 185 - i);
      s.line(460 + i, 185 - i, 620, 345);
      j -= 641;
      k += 2;
      if (await skipIntro(10)) {
        return;
      }
    }

    j = 25 * SCREEN_W + 20;
    do {
      k = j;
      for (let i = 0; i <= 8; i += 1) {
        s.fillRect(k, 3, 10, 4);
        k += 40 * SCREEN_W;
      }
      if (await skipIntro(10)) {
        return;
      }
      j += 10;
    } while (j <= 25 * SCREEN_W + 610);

    j = 25 * SCREEN_W + 19;
    do {
      k = j;
      for (let i = 0; i <= 12; i += 1) {
        s.fillRect(k, 8, 3, 4);
        k += 50;
      }
      if (await skipIntro(10)) {
        return;
      }
      j += 8 * SCREEN_W;
    } while (j <= 337 * SCREEN_W + 19);

    if (await skipIntro(2500)) {
      return;
    }
    s.drawSprite(SPRITE.LOGO_POLE, 60 * SCREEN_W + 0x5a, 7);
    s.drawSprite(SPRITE.LOGO_CHUDES, 60 * SCREEN_W + 0x118, 7);
    if (await skipIntro(2500)) {
      return;
    }

    const title = encodeCp866(' КАПИТАЛШОУ ');
    j = 0;
    k = 0xee * SCREEN_W - 15;
    for (let i = 1; i <= 12; i += 1) {
      const ch = title.subarray(i - 1, i);
      k += 50;
      if (i === 9) {
        k += 15;
      }
      s.print(ch, k - 641, 0, 14, 8);
      s.print(ch, k - 639, 0, 14, 8);
      s.print(ch, k + 639, 0, 14, 8);
      s.print(ch, k + 641, 0, 14, 8);
      s.print(ch, k + 640 + 639, 0, 14, 8);
      s.print(ch, k + 640 + 641, 0, 14, 8);
      s.print(ch, k, 15, 14, 8);
      s.print(ch, k + 640, 15, 14, 8);
      j += 100;
      await this.m.audio.sound(j, 10);
      if (await skipIntro(250)) {
        return;
      }
    }

    s.print('Сделал Дима Башуров из Арзамаса-16 (E-Mail: 0669@RFNC.NNOV.SU )', 2 * SCREEN_W + 0x44, 7, 8, 8);
    s.print('Телефон в Арзамасе-16: (83130) 5-92-73', 12 * SCREEN_W + 0xb0, 7, 8, 8);
    s.print('Посвящается друзьям', 0x1b * SCREEN_W + 0x50, 0, 14, 0x19);
    s.print('Посвящается друзьям', 0x1c * SCREEN_W + 0x50, 0, 14, 0x19);
    s.fillRect(0x6040 * 8, 0x46, SCREEN_W, 0);
    s.print('СПРАВКА: Для перемещения своей руки использйте клавиши со стрелками или', 0x136 * SCREEN_W + 0x1b, 7, 8, 8);
    s.print('"мышку". Ввод осуществляется нажатием на клавишу ПРОБЕЛ или на', 0x140 * SCREEN_W + 0x63, 7, 8, 8);
    s.print('левую кнопку"мышки". Нажатие <Ctrl+S> включает/выключает звук,', 0x14a * SCREEN_W + 0x63, 7, 8, 8);
    s.print('если пришел начальник, нажми клавишу TAB, ESC - выход из игры!', 0x154 * SCREEN_W + 0x63, 7, 8, 8);
    if (await skipIntro(INFINITE)) {
      return;
    }
  }

  /** dpr:955-982 — one-time background, bricks, lamps, character shuffle. */
  private drawStaticBackground(): void {
    this.ctx.present?.setMode('svg');
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
    this.setScene('stage-setup');
    // DIFF #20: checkpoint before round-start music. A reload then re-enters
    // stageSetup and plays the bed again (after the audio gate), instead of
    // restoring into a moment that already "used" the cue.
    // Skip stage 0 first entry — seats have no names yet; between-rounds would
    // skip the presentation prompts via presentationFromSave.
    if (
      this.resumingBetweenRounds ||
      this.stage > 0 ||
      this.seats.some((seat) => seat.nameBytes.length > 0)
    ) {
      this.persistCheckpoint('between-rounds');
    }

    const s = this.screen;
    this.drawBoardChrome();

    if (!this.resumingBetweenRounds) {
      this.winnerCarry = null;
      if (this.winner >= 0 && this.winner <= 2) {
        const w = this.seats[this.winner];
        this.winnerCarry = {
          seat: this.winner,
          spriteId: w.spriteId,
          nameBytes: new Uint8Array(w.nameBytes),
          score: w.score,
        };
      }
      // Clear every seat visually — winner art/labels from the last round must not linger.
      for (let i = 0; i <= 2; i += 1) {
        const layout = liveSeat(i);
        this.seats[i].nameBytes = new Uint8Array(0);
        this.seats[i].spriteId = null;
        if (i !== this.winner) {
          this.seats[i].score = 0;
        }
        if (!this.useSvgPlayers()) {
          this.paintSeatSprite(i, null);
        }
        if (!this.ctx.hud) {
          s.fillRect(layout.labelOfs - 641, 30, 110, 0);
          s.fillRect(layout.labelOfs, 28, 108, 7);
          s.fillRect(layout.labelOfs + SCREEN_W * 14, 14, 80, 7);
          s.fillRect(layout.moneyOfs - 644, 30, 84, 7);
        }
      }
      this.hudIntroSeat = null;
      this.syncPlayers(true);
      this.syncHud(true);
    }
    this.ctx.hud?.hideBubbles();

    let j = 332 * SCREEN_W + 31 * 20;
    for (let i = 31; i >= 0; i -= 1) {
      this.available[i] = 0x80 + i;
      if (!this.ctx.alphabet) {
        s.drawSprite(SPRITE.LETTER_BACK0, j, 8);
      }
      j -= 20;
    }
    if (this.ctx.alphabet) {
      this.syncAlphabet(true);
    } else {
      s.print(this.available, 334 * SCREEN_W + 4, 0, 14, 20);
    }

    // dpr:1034 — seats stay empty until presentation reveals them one by one.
    this.drawFortuneWheel(this.curSector);
    this.stopSfx('opening');
    this.stopSfx('openingOld');
    // Music only after the between-rounds save and studio chrome are in place.
    if (this.stage > 0) {
      this.playSfx('sting');
    }
    this.playSfx('playersEnter', { volume: PLAYERS_ENTER_VOLUME, restart: true });
    // WEB DIFF #27: TV studio open (Wikiquote catchphrase + calendar weekday).
    if (this.stage === 0) {
      for (const line of firstTourGreeting(broadcastWeekday())) {
        await this.yakubovichTalk(line);
      }
      await this.yakubovichTalk(firstTourInvite());
    } else {
      if (this.resumingBetweenRounds) {
        await this.delay(800);
      } else {
        await this.delay(4000);
      }
      await this.yakubovichTalk(laterTourGreeting(this.stage));
      await this.yakubovichTalk(laterTourInvite(this.stage));
    }
  }

  /** Reload at between-rounds: redraw saved seats without wiping names or re-prompting. */
  private async presentationFromSave(): Promise<void> {
    this.setScene('presentation');
    for (let j = 0; j <= 2; j += 1) {
      const seat = this.seats[j];
      if (j !== this.winner) {
        seat.score = 0;
      }
      if (seat.spriteId !== null) {
        this.paintSeatSprite(j, seat.spriteId);
      }
      this.paintScore(j);
    }
    this.drawFortuneWheel(this.curSector);
    this.syncHud(true);
    this.syncDebug();
    this.winner = 3;
    this.resumingBetweenRounds = false;
  }

  /** Seat caption blink (dpr:1047-1054) — name plate label only, no player name yet. */
  private async playCaptionIntro(seatIdx: number): Promise<void> {
    const s = this.screen;
    const layout = liveSeat(seatIdx);
    const hud = this.ctx.hud;
    const seat = this.seats[seatIdx];
    const savedName = seat.nameBytes;
    seat.nameBytes = new Uint8Array(0);
    this.hudIntroSeat = seatIdx;
    if (!hud) {
      s.fillRect(layout.labelOfs - 641, 30, 110, 0);
      s.fillRect(layout.labelOfs, 28, 108, 7);
    }
    for (let i = 3; i >= 0; i -= 1) {
      if (hud) {
        this.syncHud(true, { seat: seatIdx, on: (i & 1) === 1 });
      } else {
        s.print(layout.caption, layout.labelOfs + 14, (i & 1) * 7, 14, 8);
      }
      await this.m.audio.sound(i * 10 + 100, 20);
      await this.delay(120);
    }
    await this.m.audio.sound(50, 100);
    seat.nameBytes = savedName;
    this.syncHud(true, { seat: seatIdx, on: false });
  }

  /** dpr:1040-1087 — sprite first, then caption blink, then name (web order). */
  private async presentation(): Promise<void> {
    if (this.resumingBetweenRounds) {
      await this.presentationFromSave();
      return;
    }
    this.setScene('presentation');
    const s = this.screen;
    const { input } = this.m;

    for (let j = 0; j <= 2; j += 1) {
      const seat = this.seats[j];
      const layout = liveSeat(j);
      const hud = this.ctx.hud;
      this.hudIntroSeat = j;

      if (j === this.winner && this.winnerCarry?.seat === j) {
        seat.spriteId = this.winnerCarry.spriteId;
        seat.nameBytes = new Uint8Array(this.winnerCarry.nameBytes);
        seat.score = this.winnerCarry.score;
        this.winnerCarry = null;
      } else if (j !== this.winner) {
        seat.nameBytes = new Uint8Array(0);
        seat.spriteId = null;
        seat.score = 0;
      }

      // Seat 0 is never prompted (dpr:1057); in 1-player web mode only
      // seat 1 is, in the original mode seats 1 and 2 both are.
      const prompted = j !== this.winner && j > 0 && j <= this.humanSeats;
      let captionDone = false;

      if (prompted) {
        seat.spriteId = SPRITE.PLAYER;
        this.paintSeatSprite(j, SPRITE.PLAYER);
        await this.delay(280);
        await this.playCaptionIntro(j);
        captionDone = true;

        await this.yakubovichSetSilent();
        // Name field open while the host says «представьтесь».
        const nameOfs = hud ? BACKBUF + SCREEN_W * 14 : layout.labelOfs + SCREEN_W * 14;
        const entry = input.beginTextEntry(10, nameOfs, 8);
        const pollName = hud
          ? window.setInterval(() => {
              hud.setNameEntry({
                seat: j,
                text: decodeCp866(new Uint8Array(entry.bytes)),
                caret: Math.floor(Date.now() / 400) % 2 === 0,
              });
            }, 50)
          : 0;
        await Promise.all([
          this.yakubovichTalk('Пожалуйста, представьтесь!'),
          input.waitEnter(INFINITE),
        ]);
        if (hud) {
          window.clearInterval(pollName);
          hud.setNameEntry(null);
        }
        input.endTextEntry();
        if (!hud) {
          s.fillRect(layout.labelOfs + SCREEN_W * 14, 14, 80, 7);
        }
        seat.nameBytes = new Uint8Array(entry.bytes);
      }

      if (j !== this.winner && seat.nameBytes.length === 0) {
        if (prompted && this.humanSeats === 1) {
          // WEB: 1-player mode keeps a human seat under a default name.
          seat.nameBytes = encodeCp866('ИГРОК');
          seat.spriteId = SPRITE.PLAYER;
        } else {
          // Empty name (or an unprompted seat): NPC takes it (dpr:1070-1077).
          const character = this.characters[this.charId];
          seat.spriteId = character.spriteId;
          seat.nameBytes = encodeCp866(character.name);
          this.charId = (this.charId + 1) % this.characters.length;
        }
      }

      if (seat.spriteId !== null) {
        this.paintSeatSprite(j, seat.spriteId);
        if (!captionDone) {
          await this.delay(280);
          await this.playCaptionIntro(j);
        }
      }

      if (!this.ctx.hud) {
        s.print(seat.nameBytes, layout.labelOfs + 54 - (seat.nameBytes.length << 2) + 14 * SCREEN_W, 0, 14, 8);
      }
      this.drawFortuneWheel(this.curSector);
      const moneyFrom = j === this.winner ? seat.score : 0;
      await this.updateMoney(j, moneyFrom);
      this.hudIntroSeat = null;
      this.syncHud(true);
      this.syncDebug();
      await this.delay(500);
    }
    this.hudIntroSeat = null;
    this.winnerCarry = null;
    this.winner = 3;
  }

  /** dpr:1091-1115 */
  private async selectWord(): Promise<void> {
    this.setScene('word-select');
    const s = this.screen;
    const { questions } = this.ctx;
    if (questions.length === 0) {
      throw new Error('No questions loaded');
    }

    let curWord: number;
    if (questions.length >= TOURNAMENT_ROUNDS) {
      // dpr:1091-1096 — retry until unused this session (Delphi deviation #12, kept).
      do {
        curWord = this.random(questions.length) + 1;
      } while (this.prevWords.slice(0, this.stage).includes(curWord));
    } else {
      // WEB: pools smaller than 8 would soft-lock the retry loop; allow repeats.
      curWord = this.random(questions.length) + 1;
    }
    this.prevWords[this.stage] = curWord;

    // Evidence-corrected OVL pairing: pair w = (word, theme) = parser questions[w-1]
    // (the literal Delphi indexing mispairs and overruns; see architecture.md).
    const question = questions[curWord - 1];
    this.guessedWord = encodeCp866(question.word);
    this.remaindLetters = this.guessedWord.length;
    this.opened = new Array(this.guessedWord.length).fill(false);
    this.ctx.state.theme = question.theme;
    this.wordPos = 0x19 * SCREEN_W + 121 + 12 * 16 - ((this.remaindLetters >> 1) << 4);
    if (this.ctx.board) {
      this.syncBoard(true);
    } else {
      for (let i = this.remaindLetters - 1; i >= 0; i -= 1) {
        s.fillRect((i << 4) + this.wordPos + 11 * SCREEN_W, 19, 14, 8);
      }
    }

    await this.yakubovichSetSilent();
    await this.yakubovichTalk('И вот задание на этот тур.');
    await this.yakubovichSetSilent();
    this.setSfxVolume('playersEnter', PLAYERS_ENTER_UNDER_HOST);
    await this.yakubovichTalk(question.theme);
    // DIFF #28: DOS waited for Space here; continue into the first spin.
    await this.yakubovichSetSilent();
    this.syncDebug();
  }

  /** dpr:1125-1189. DOS: offered to human seats only (deviation #5). */
  private async boxGame(): Promise<void> {
    this.setScene('box-game');
    const s = this.screen;
    const seat = this.seats[this.curPlayer];
    const { talkBubbleOfs } = liveSeat(this.curPlayer);
    const areaOfs = talkBubbleOfs - 60 * SCREEN_W - 32;

    await this.yakubovichTalk('Три правильно угаданные буквы дают вам право на две шкатулки. Две шкатулки в студию!');
    const boxes = this.ctx.boxes;
    if (!boxes) {
      s.screenCopy(104, 121, BACKBUF + areaOfs, areaOfs);
    }

    let k = 61;
    let j = talkBubbleOfs + 60 * SCREEN_W;
    for (let i = 30; i >= 0; i -= 1) {
      await this.m.audio.sound(1000 - i * 20, 10, { audible: true });
      if (boxes) {
        boxes.show(boxBringIn(talkBubbleOfs, 30 - i));
      } else {
        s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
        s.drawSprite(SPRITE.BOX_OPENED, j - 46 * SCREEN_W - 32, 7);
        s.drawSprite(SPRITE.BOX_OPENED, j - 46 * SCREEN_W + 24, 7);
        s.drawSprite(SPRITE.BOX_MONEY, j - 60 * SCREEN_W + 26, 7);
        s.screenCopy(104, k, talkBubbleOfs - 32, BACKBUF + talkBubbleOfs - 32);
        k -= 2;
        j -= 1280;
      }
      await this.delay(i);
    }
    await this.waitKey(5000);

    if (!boxes) {
      s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
    }
    await this.m.audio.sound(1000, 10, { audible: true });
    if (boxes) {
      boxes.show(boxClosedPair(talkBubbleOfs, false).slice(0, 1));
    } else {
      s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 41 * SCREEN_W - 32, 7);
    }
    await this.m.audio.sound(100, 10, { audible: true });
    if (boxes) {
      boxes.show(boxClosedPair(talkBubbleOfs, false));
    } else {
      s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 41 * SCREEN_W + 24, 7);
    }
    await this.m.audio.sound(500, 10, { audible: true });
    await this.waitKey(2000);

    k = this.random(20) + 10;
    for (let i = k; i >= 0; i -= 1) {
      await this.m.audio.sound(this.random(100) + 50, 10, { audible: true });
      await this.delay(50);
      if (boxes) {
        boxes.show(boxClosedPair(talkBubbleOfs, (i & 1) !== 0));
      } else {
        s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
        if ((i & 1) === 0) {
          s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 41 * SCREEN_W - 32, 7);
          s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 41 * SCREEN_W + 24, 7);
        } else {
          s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 36 * SCREEN_W - 6, 7);
          s.drawSprite(SPRITE.BOX_CLOSED, talkBubbleOfs - 46 * SCREEN_W + 4, 7);
        }
      }
    }
    await this.yakubovichSetSilent();
    await this.yakubovichTalk('Какую вам шкатулку? Левую-правую, правую-левую?');
    const choice = await this.playerDecision('', '', 'Левая', 'Правая');
    await this.yakubovichSetSilent();
    k &= 1;
    if (boxes) {
      boxes.show(boxReveal(talkBubbleOfs, k === 1));
    } else {
      s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
      s.drawSprite(SPRITE.BOX_OPENED, talkBubbleOfs - 46 * SCREEN_W - 32, 7);
      s.drawSprite(SPRITE.BOX_OPENED, talkBubbleOfs - 46 * SCREEN_W + 24, 7);
      s.drawSprite(SPRITE.BOX_MONEY, talkBubbleOfs - 60 * SCREEN_W - 30 + 56 * k, 7);
    }
    if (choice === k) {
      this.playSfx('boxMoney');
    await this.yakubovichReply('Браво!!! Вы отгадали!');
      const before = seat.score;
      // DIFF #29: TV-scale purse; DOS awarded 100.
      seat.score += 1000;
      await this.yakubovichSetSilent();
      if (boxes) {
        boxes.setVisible(false);
      } else {
        s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
      }
      await this.updateMoney(this.curPlayer, before);
    } else {
      this.playSfx('boxEmpty');
      await this.yakubovichReply('Увы! Эта шкатулка пуста!');
      await this.yakubovichSetSilent();
      if (boxes) {
        boxes.setVisible(false);
      } else {
        s.screenCopy(104, 121, areaOfs, BACKBUF + areaOfs);
      }
      await this.updateMoney(this.curPlayer, seat.score);
    }
    this.movesForBox = 0;
  }

  /** dpr:1196-1224. Returns 'won' | 'removed'. */
  private async tellWord(): Promise<'won' | 'removed'> {
    this.setScene('word-solve');
    const s = this.screen;
    const { input } = this.m;

    const maxLen = this.guessedWord.length;
    const entry = input.beginTextEntry(maxLen, this.wordPos + 13 * SCREEN_W + 4, 16);
    const k = maxLen << 4;
    const board = this.ctx.board;
    if (board) {
      const pollEntry = window.setInterval(() => {
        board.setWordBoard(this.wordPos, this.wordBoardCells(new Uint8Array(entry.bytes)));
      }, 50);
      board.setWordBoard(this.wordPos, this.wordBoardCells(new Uint8Array(entry.bytes)));
      await input.waitEnter(INFINITE);
      window.clearInterval(pollEntry);
      input.endTextEntry();
      board.setWordBoard(this.wordPos, this.wordBoardCells());
    } else {
      s.screenCopy(k, 31, BACKBUF + this.wordPos, this.wordPos);
      let j = entry.ofs - 2 * SCREEN_W - 4;
      for (let i = maxLen; i >= 1; i -= 1) {
        s.fillRect(j, 19, 14, 7);
        j += 16;
      }
      await input.waitEnter(INFINITE);
      input.endTextEntry();
    }

    const typed = new Uint8Array(entry.bytes);
    const match = typed.length === this.guessedWord.length
      && typed.every((b, idx) => b === this.guessedWord[idx]);
    if (match) {
      await this.concludeCorrectWordGuess();
      return 'won';
    }
    if (!this.ctx.board) {
      s.screenCopy(k, 31, this.wordPos, BACKBUF + this.wordPos);
    }
    this.paintWordBoard();
    this.playSfx(this.inSupergameSolve() ? 'wordWrongSuper' : 'wordWrong');
    await this.yakubovichReply('Неправильно! Вы покидаете игру!');
    this.removePlayer();
    return 'removed';
  }

  /**
   * Whole-word win: host says «<слово>, ну конечно!» immediately while the
   * assistant walks out and flips every still-closed cell (DIFF #24 carve-out).
   */
  private async concludeCorrectWordGuess(): Promise<void> {
    this.playSfx('wordCorrect');
    await Promise.all([
      // Two lines so spokenCasing title-cases the ALL-CAPS bank word (a single
      // `"WORD. Ну конечно!"` string stays shouty and TTS spells letters).
      this.yakubovichTalk(decodeCp866(this.guessedWord), 'Ну конечно!'),
      this.assistantRevealRemainingLetters({ leadInMs: 0 }),
    ]);
    await this.yakubovichSetSilent();
  }

  /** dpr:1352-1358 */
  private removePlayer(): void {
    const s = this.screen;
    const layout = liveSeat(this.curPlayer);
    this.seats[this.curPlayer].spriteId = null;
    this.seats[this.curPlayer].nameBytes = new Uint8Array(0);
    if (!this.ctx.hud) {
      s.fillRect(layout.moneyOfs - 644, 30, 84, 7);
    }
    if (this.useSvgPlayers()) {
      this.paintSeatSprite(this.curPlayer, null);
    } else {
      s.fillRect(layout.spriteOfs, 83, 87, 7);
    }
    if (!this.ctx.hud) {
      s.fillRect(layout.labelOfs - 641, 30, 110, 7);
    }
    this.drawFortuneWheel(this.curSector);
    this.syncDebug();
  }

  /** dpr:1229-1244. DIFF #26: friction spin, 1.1–2.5 turns (hold stretches toward 2.5). */
  private async spinWheel(holdMs = this.spinHoldMs): Promise<void> {
    const sectorCount = this.ctx.wheel?.getSectorCount() ?? WHEEL_SECTOR_COUNT;
    const stepDeg = this.ctx.wheel?.getStepDeg() ?? WHEEL_STEP_DEG;
    const milliturns = spinMilliturns(holdMs, this.random(1401));
    const totalSteps = spinStepsFromMilliturns(milliturns, sectorCount);
    const turns = milliturns / 1000;
    const meanTurns = (SPIN_MIN_TURNS + SPIN_MAX_TURNS) / 2;
    const durationMs = Math.round(
      (SPIN_DURATION_MS + this.random(SPIN_DURATION_JITTER_MS)) * (turns / meanTurns),
    );
    const startDeg = -this.curSector * stepDeg;
    const deltaDeg = -totalSteps * stepDeg;
    this.playSfx('drumSpin', { loop: true });
    this.ctx.wheel?.setVisible(true);
    let elapsed = 0;
    while (elapsed < durationMs) {
      const u = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
      this.ctx.wheel?.setAngle(startDeg + deltaDeg * spinEase(u));
      const frame = Math.min(SPIN_FRAME_MS, durationMs - elapsed);
      await this.delay(frame);
      elapsed += frame;
    }
    this.curSector = (this.curSector + totalSteps) % sectorCount;
    if (this.wheelSuperMode) {
      this.superSector = this.curSector;
    }
    this.drawFortuneWheel(this.curSector);
    this.stopSfx('drumSpin');

    let k = 0;
    for (let n = 1; n <= 30; n += 1) {
      k = this.m.audio.pwm(this.audioBuf, k, 1000 - n * 30, Math.floor(n / 5) + Math.floor(n / 3));
    }
    await this.m.audio.playWav(this.audioBuf.subarray(0, k));
    this.syncDebug();
  }

  private inSupergameSolve(): boolean {
    return this.ctx.state.scene === 'supergame-solve';
  }

  /**
   * dpr:1265-1291 (ПЛЮС) — pick a POSITION in the word. Returns the 1-based
   * position n; the letter index is derived from the word byte there.
   */
  private async pickPlusPosition(): Promise<number> {
    this.setScene('letter-pick');
    const s = this.screen;
    const { input } = this.m;

    if (!this.isHuman(this.curPlayer)) {
      let n: number;
      do {
        n = this.random(this.guessedWord.length) + 1;
      } while (this.available[this.guessedWord[n - 1] - 0x80] === 0x20);
      return n;
    }

    if (!this.ctx.hand) {
      s.screenCopy(SCREEN_W, 60, BACKBUF + 0x320 * 8, 0x320 * 8);
    }
    const hand = input.hand;
    hand.step = 16;
    hand.ofs = this.wordPos - 13 * SCREEN_W;
    hand.min = hand.ofs;
    hand.max = hand.ofs + (this.guessedWord.length << 4) - 16;
    hand.prev = 12 * SCREEN_W + 0xc8;
    let n = 1;
    const svgHand = this.ctx.hand;
    for (;;) {
      if (!svgHand) {
        s.restoreBehind();
        s.saveBehind(hand.ofs, 15, 26);
        s.drawSprite(SPRITE.HAND, hand.ofs, 2);
      }
      n = (hand.ofs - hand.min + 16) >> 4;
      const letterIdx = this.guessedWord[n - 1] - 0x80;
      if (input.pollKeyPressed()) {
        if (this.available[letterIdx] === 0x20) {
          await this.m.audio.sound(1000, 32);
        } else {
          break;
        }
      }
      // WEB: the original busy-waits here; yield so the browser can deliver input.
      await this.delay(10);
    }
    if (!svgHand) {
      s.restoreBehind();
    }
    hand.step = 0;
    return n;
  }

  /** dpr:1366-1396 — pick a letter from the alphabet row. Returns letter index 0..31. */
  private async pickLetter(): Promise<number> {
    this.setScene('letter-pick');
    const s = this.screen;
    const { input } = this.m;
    if (!this.ctx.hand) {
      s.screenCopy(SCREEN_W, 60, BACKBUF + 0x59b0 * 8, 0x59b0 * 8);
    }

    if (this.isHuman(this.curPlayer)) {
      const hand = input.hand;
      const alphaMin = 0x13a * SCREEN_W;
      hand.step = 20;
      hand.min = alphaMin;
      hand.max = alphaMin + 31 * 20;

      // Start on the first available (non-used) letter instead of always А.
      let startIdx = 0;
      while (startIdx < 32 && this.available[startIdx] === 0x20) {
        startIdx += 1;
      }
      hand.ofs = alphaMin + startIdx * 20;
      // prev == ofs on first frame so the initial screenCopy is a no-op.
      hand.prev = hand.ofs;

      let i = startIdx;
      for (;;) {
        // If input.ts moved us onto a used cell, jump to the nearest available
        // in the travel direction.
        let idx = Math.floor((hand.ofs - hand.min) / 20);
        if (this.available[idx] === 0x20) {
          const dir = hand.ofs > hand.prev ? 1 : -1;
          let next = idx + dir;
          while (next >= 0 && next < 32 && this.available[next] === 0x20) {
            next += dir;
          }
          // If we hit the wall, try the other direction.
          if (next < 0 || next >= 32) {
            next = idx - dir;
            while (next >= 0 && next < 32 && this.available[next] === 0x20) {
              next -= dir;
            }
          }
          if (next < 0 || next >= 32) {
            break; // No available letter — should not happen.
          }
          hand.prev = hand.ofs;
          hand.ofs = hand.min + next * 20;
          idx = next;
        }
        i = idx;
        if (!this.ctx.hand) {
          s.restoreBehind();
          s.saveBehind(hand.ofs, 15, 26);
          s.drawSprite(SPRITE.HAND, hand.ofs, 2);
        }
        if (input.pollKeyPressed()) {
          if (!this.ctx.hand) {
            s.restoreBehind();
          }
          hand.step = 0;
          this.clearAlphabetCell(i);
          return i;
        }
        // WEB: yield (original busy-loop).
        await this.delay(10);
      }
    }

    // dpr:1389-1396 — the original NPC heuristic. Point at the tile; speech is in openLetter.
    let i: number;
    if (this.remaindLetters << 1 < this.guessedWord.length && this.random(this.stage + 2) > 0) {
      do {
        i = this.guessedWord[this.random(this.guessedWord.length)] - 0x80;
      } while (this.available[i] === 0x20);
    } else {
      do {
        i = this.random(32);
      } while (this.available[i] === 0x20);
    }
    this.m.input.hand.step = 0;
    this.clearAlphabetCell(i);
    return i;
  }

  /**
   * dpr:1398-1497 — open the chosen letter. `letterIdx` 0..31; `n` is the
   * 1-based word position for the ПЛЮС sector, else 0. DIFF #26: TV scoring
   * adds unit×hits, doubles, or leaves the score unchanged.
   */
  private async openLetter(
    letterIdx: number,
    n: number,
    award: { kind: 'perHit'; unit: number } | { kind: 'double' } | { kind: 'keep' },
  ): Promise<boolean> {
    this.setScene('letter-open');
    const s = this.screen;
    const seat = this.seats[this.curPlayer];
    const letterByte = this.available[letterIdx];
    const letterChar = decodeCp866(new Uint8Array([letterByte]));
    this.available[letterIdx] = 0x20;
    this.syncDebug();

    await this.vanishAlphabetTile(letterIdx);
    // Redraw the full alphabet row so no artefacts remain on the layers below
    // (sprites, name plates) after the tile animation clears the bottom strip.
    this.paintAlphabetRow();
    const replica = letterReplica(letterChar, n);
    await this.playerSay(replica.display, replica.spoken);
    await this.yakubovichSetSilent();

    // Count matches and assistant stop positions (dpr:1427-1437).
    const openBeforeWalk = new Set<number>();
    for (let j = 0; j < this.guessedWord.length; j += 1) {
      if (this.opened[j]) {
        openBeforeWalk.add(j);
      }
    }
    // DIFF #23: ASSIST_STAY is 25px, cells 16px. Walk to the stand pose whose
    // midline matches the cell center (not the cell's left edge).
    const assistStayWidth = 25;
    const wordCellWidth = 16;
    const assistStandShift = (assistStayWidth - wordCellWidth) >> 1;
    const assistPos: number[] = new Array(20).fill(0);
    assistPos[0] = 0x19 * SCREEN_W + 639;
    let k = 0;
    for (let j = this.guessedWord.length - 1; j >= 0; j -= 1) {
      if (this.guessedWord[j] === letterByte) {
        k += 1;
        assistPos[k] = this.wordPos + (j << 4) - assistStandShift;
        this.opened[j] = true;
      }
    }
    this.remaindLetters -= k;
    this.syncDebug();
    const hits = k;

    if (k === 0) {
      this.playSfx('letterWrong');
      await this.yakubovichReply('Увы, такой буквы нет!');
      return false;
    }

    if (n === 0) {
      await this.yakubovichTalk('И в этом слове есть такая буква! Откройте!');
    }
    this.snapshotRoundToBackbuf();

    // WEB: beat after the host confirms, then the assistant leaves the wings.
    await this.delay(1000);

    // Assistant walk (dpr:1456-1480). WEB: card sting after each flip.
    const stepDelta = [3, 10, 0, 12];
    const stepSprite = [SPRITE.ASSIST_MOVE1, SPRITE.ASSIST_MOVE3, SPRITE.ASSIST_MOVE2, SPRITE.ASSIST_MOVE3];
    let i3 = 0;
    let walk = ASSIST_WALK_Y * SCREEN_W + ASSIST_WALK_X0;
    const revealed = new Set<number>();
    const assist = this.ctx.assist;
    const syncAssist = (ofs: number, spriteId: number): void => {
      if (assist) {
        assist.sync(true, ofs, spriteId);
      }
    };
    try {
    do {
      let blitOfs = walk;
      if (k > 0 && walk >= assistPos[k]) {
        walk = assistPos[k];
        blitOfs = walk;
        if (!assist) {
          s.drawSprite(SPRITE.ASSIST_STAY, blitOfs, 2);
        }
        syncAssist(blitOfs, SPRITE.ASSIST_STAY);
        if (this.ctx.board) {
          revealed.add(this.letterIndexAtAssist(assistPos[k]));
          this.syncBoard(true, revealed, openBeforeWalk);
        } else {
          const f = BACKBUF + assistPos[k] + assistStandShift + 11 * SCREEN_W;
          s.fillRect(f, 19, 15, 7);
          s.print(letterChar, f + 4 + 2 * SCREEN_W, 0, 14, 8);
          s.screenCopy(15, 19, f - BACKBUF, f);
        }
        k -= 1;
        if (!assist) {
          s.drawSprite(SPRITE.ASSIST_STAY, blitOfs, 2);
        }
        syncAssist(blitOfs, SPRITE.ASSIST_STAY);
        this.playSfx('letterCorrect');
        await this.waitKey(1450);
      } else {
        const nextStep = stepDelta[(i3 + 1) & 3];
        if (k > 0 && walk + nextStep >= assistPos[k]) {
          walk = assistPos[k];
          continue;
        }
        i3 = (i3 + 1) & 3;
        walk += stepDelta[i3];
        blitOfs = walk;
        if (!assist) {
          s.drawSprite(stepSprite[i3], walk, 2);
        }
        syncAssist(blitOfs, stepSprite[i3]);
        await this.m.audio.sound(this.random(100) + 1000, 7, { audible: true });
      }
      await this.delay(50);
      if (!assist) {
        s.screenCopy(48, 90, blitOfs, BACKBUF + blitOfs);
      }
    } while (walk < ASSIST_WALK_Y * SCREEN_W + ASSIST_WALK_X1);
    } finally {
      assist?.sync(false, 0, SPRITE.ASSIST_STAY);
    }

    let k2 = 0;
    for (let i = 0x64; i >= 20; i -= 1) {
      k2 = this.m.audio.pwm(this.audioBuf, k2, i, Math.floor((0x64 - i) / 10));
      k2 = this.m.audio.pwm(this.audioBuf, k2, 0, 1);
    }
    await this.m.audio.playWav(this.audioBuf.subarray(0, k2), { audible: true });

    const scoreBefore = seat.score;
    if (!this.supergameActive) {
      if (award.kind === 'perHit') {
        seat.score += award.unit * hits;
      } else if (award.kind === 'double') {
        seat.score *= 2;
      }
      // Плюс / keep: score unchanged — do not restack the coin pile.
      if (award.kind !== 'keep') {
        await this.updateMoney(this.curPlayer, scoreBefore);
      }
    }
    this.syncDebug();
    return true;
  }

  /** dpr:1300-1359 — the ПРИЗ sector ceremony (human only under DOS policy). */
  private async prizeCeremony(): Promise<void> {
    this.setScene('prize');
    this.hideWheel();
    this.playSfx('prizesStudio');
    this.playSfx('autoWin');
    this.playSfx('automobileYell');
    const s = this.screen;
    const seat = this.seats[this.curPlayer];
    const layout = liveSeat(this.curPlayer);

    s.screenCopy(SCREEN_W, 350, BACKBUF, 0);
    s.fillRect(0, 350, SCREEN_W, 7);
    s.drawSprite(SPRITE.LOGO_POLE, 10 + 10 * SCREEN_W, 7);
    s.drawSprite(SPRITE.LOGO_CHUDES, 0xc8 + 10 * SCREEN_W, 7);
    s.drawSprite(SPRITE.YAKUBOVICH_BASE, 0x1e0 + 0xac * SCREEN_W, 7);
    s.drawSprite(SPRITE.YAKUBOVICH_PASSIVE, 0x1ff + 0xad * SCREEN_W, 16);
    s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, 0x214 + 0xd1 * SCREEN_W, 16);
    if (seat.spriteId !== null) {
      s.drawSprite(seat.spriteId, layout.spriteOfs, 2);
    }

    let i = 3;
    let j = 100;
    for (;;) {
      await this.yakubovichTalk(`Приз или ${MONEY_VALUES[i]} рублей?`);
      const takeMoney = (await this.playerDecision('Беру    Беру', 'ПРИЗ   ДЕНЬГИ', 'Приз!', 'Деньги.')) > 0;
      if (takeMoney) {
        await this.yakubovichTalk('Забирайте свои деньги!');
        do {
          await this.m.audio.sound(this.random(50), 10);
          s.drawSprite(SPRITE.RUB, this.random(295) * SCREEN_W + this.random(400), 2);
          j -= 100;
        } while (j > 0);
        break;
      }
      // DOS: deviation #7 — Yakubovich always bargains up to МИЛЛИОН (i = 0).
      if (i === 0) {
        this.playSfx('vseVashe');
        await this.yakubovichTalk('Забирайте свой приз!');
        s.print('Вы выбрали ПРИЗ и мы Вас поздравляем!', 208 * SCREEN_W + 92, 0, 14, 8);
        s.print('Фирма ИНТЕРМОДА и ПОЛЕ ЧУДЕС дарит Вам', 226 * SCREEN_W + 88, 0, 14, 8);
        const prize = `${PRIZES[this.random(10)]} компании PROCTER & GAMBLE!`;
        s.print(prize, 244 * SCREEN_W + 240 - (this.len(prize) << 2), 0, 14, 8);
        s.print('За ПРИЗОМ обращайтесь по адресу:', 262 * SCREEN_W + 112, 0, 14, 8);
        s.print('101000-Ц, Москва, проезд Серова, 11', 280 * SCREEN_W + 100, 0, 14, 8);
        s.print('На конверте сделайте пометку КОМПЬЮТЕРНЫЙ ПРИЗ', 298 * SCREEN_W + 56, 0, 14, 8);
        s.print('Автор Дима Башуров из Российского Федерального Ядерного Центра', 0x14c * SCREEN_W + 72, 0, 8, 8);
        s.print('Телефон в Арзамасе-16 : (831-30) 5-92-73   E-mail: 0669 @ RFNC. NNOV. SU', 0x155 * SCREEN_W + 32, 0, 8, 8);
        break;
      }
      j *= 10;
      i -= 1;
    }
    await this.waitKey(INFINITE);
    s.screenCopy(SCREEN_W, 350, 0, BACKBUF);
    this.removePlayer();
  }

  /**
   * One player's turn (dpr:1120-1500). Returns:
   * 'again' — same player continues; 'next' — pass the turn;
   * 'won' — round solved by the current player.
   */
  private async takeTurn(): Promise<'again' | 'next' | 'won'> {
    this.setScene('turn');
    const seat = this.seats[this.curPlayer];
    const human = this.isHuman(this.curPlayer);

    const toAward = (
      awardKind: 'perHit' | 'double' | 'keep',
      awardUnit: number,
    ): { kind: 'perHit'; unit: number } | { kind: 'double' } | { kind: 'keep' } =>
      awardKind === 'perHit' ? { kind: 'perHit', unit: awardUnit } :
      awardKind === 'double' ? { kind: 'double' } : { kind: 'keep' };

    // WEB: letter already chosen — finish opening without re-spin / re-pick.
    if (this.resumeAtLetterOpen) {
      const { awardKind, awardUnit, letterIdx, plusPosition } = this.resumeAtLetterOpen;
      this.resumeAtLetterOpen = null;
      const found = await this.openLetter(letterIdx, plusPosition, toAward(awardKind, awardUnit));
      if (found) {
        if (human) { this.movesForBox += 1; }
        return 'again';
      }
      return 'next';
    }

    // WEB: resume straight to letter-pick if spin was already done before reload.
    if (this.resumeAtLetterPick) {
      const { awardKind, awardUnit } = this.resumeAtLetterPick;
      this.resumeAtLetterPick = null;
      const award = toAward(awardKind, awardUnit);
      const letterIdx = await this.pickLetter();
      this.persistCheckpoint('letter-open', award, { letterIdx });
      const found = await this.openLetter(letterIdx, 0, award);
      if (found) {
        if (human) { this.movesForBox += 1; }
        return 'again';
      }
      return 'next';
    }

    const skipSpin = this.resumeAfterSpin;
    this.resumeAfterSpin = false;

    if (!skipSpin) {
      // DOS: box game after 3 successful MOVES, human seats only (deviations #4, #5).
      // WEB: all seats trigger the box game, not just human (DIFF #30).
      if (this.movesForBox > 2) {
        await this.boxGame();
      }

      await this.yakubovichTalk(this.playerName(this.curPlayer), 'Вращайте барабан!');
      if (human) {
        const choice = await this.playerDecision(
          'Скажу   Кручу',
          'СЛОВО  БАРАБАН',
          'Скажу слово!',
          'Кручу барабан!',
          undefined,
          { deferSpeech: true, measureHold: true },
        );
        if (choice === 0) {
          await this.playerSay('Скажу слово!');
          const result = await this.tellWord();
          if (result === 'won') {
            this.winner = this.curPlayer;
            this.persistCheckpoint('word-solved');
            return 'won';
          }
          return 'next';
        }
        await Promise.all([this.playerSay('Кручу барабан!'), this.spinWheel()]);
      } else {
        await this.yakubovichSetSilent();
        await this.spinWheel();
      }
      // Anti-cheat: drum result is committed before sector dialogue / letter pick.
      this.persistCheckpoint('after-spin');
    }

    const landed = WHEEL_SECTORS[this.curSector];
    let award: { kind: 'perHit'; unit: number } | { kind: 'double' } | { kind: 'keep' } = { kind: 'keep' };

    switch (landed.kind) {
      case 'bankrupt': {
        this.playSfx('bankrupt');
        await this.yakubovichTalk('Все деньги сгорели! Увы! Переход хода.');
        const burned = seat.score;
        seat.score = 0;
        await this.updateMoney(this.curPlayer, burned);
        return 'next';
      }
      case 'zero': {
        this.playSfx('sectorZero');
        await this.yakubovichTalk('У вас 0 очков! Увы! Переход хода.');
        return 'next';
      }
      case 'plus': {
        this.playSfx('sectorPlus');
        await this.yakubovichTalk('Сектор плюс! Откройте любую букву!');
        const n = await this.pickPlusPosition();
        const letterIdx = this.guessedWord[n - 1] - 0x80;
        this.persistCheckpoint('letter-open', { kind: 'keep' }, { letterIdx, plusPosition: n });
        const found = await this.openLetter(letterIdx, n, { kind: 'keep' });
        if (found) {
          if (human) {
            this.movesForBox += 1;
          }
          return 'again';
        }
        return 'next';
      }
      case 'x2': {
        this.playSfx('sectorX2');
        await this.yakubovichTalk('У вас призовой сектор — все ваши очки умножаются на 2, буква!');
        award = { kind: 'double' };
        break;
      }
      case 'prize': {
        this.playSfx('sectorPrize');
        await this.yakubovichTalk('Сектор приз! Приз или играем?');
        const play = (await this.playerDecision('Беру   Буду', 'ПРИЗ  ИГРАТЬ', 'Приз!', 'Играем!', human ? undefined : 1)) > 0;
        if (play) {
          await this.yakubovichReply('Если так, то назовите букву.');
          break;
        }
        await this.prizeCeremony();
        return 'next';
      }
      case 'points': {
        award = { kind: 'perHit', unit: landed.value };
        await this.yakubovichTalk(`У вас ${landed.value} очков! Назовите букву!`);
        break;
      }
    }

    this.persistCheckpoint('letter-pick', award);
    const letterIdx = await this.pickLetter();
    this.persistCheckpoint('letter-open', award, { letterIdx });
    const found = await this.openLetter(letterIdx, 0, award);
    if (found) {
      if (human) {
        this.movesForBox += 1;
      }
      return 'again';
    }
    return 'next';
  }

  /**
   * dpr:1501-1514. Returns false when every seat is removed (→ adware path).
   */
  private async nextPlayer(): Promise<boolean> {
    // await this.waitKey(2000);
    await this.yakubovichSetSilent();
    this.movesForBox = 0;
    const start = this.curPlayer;
    for (;;) {
      this.curPlayer = (this.curPlayer + 1) % 3;
      if (this.seats[this.curPlayer].spriteId !== null) {
        return true;
      }
      if (this.curPlayer === start) {
        return false;
      }
    }
  }

  /** dpr:1521-1554. DIFF #19: plaque is an SVG overlay over Yakubovich. */
  private async adware(): Promise<void> {
    if (this.stage >= TOURNAMENT_ROUNDS - 1) {
      return;
    }
    this.setScene('adware');
    const s = this.screen;
    this.playSfx('commercial');
    this.playSfx('sponsor');
    await this.yakubovichSetSilent();
    await this.yakubovichTalk('Рекламная пауза!');
    await this.yakubovichSetSilent();

    const adware = this.ctx.adware;
    if (adware) {
      let k = 120;
      for (let i = 79; i >= 0; i -= 1) {
        adware.setRise(i);
        await this.m.audio.sound(k, 10);
        k += 20;
        await this.delay(i >> 1);
      }
      await this.waitKey(INFINITE);
      adware.setVisible(false);
      this.paintYakubovichStudio();
      return;
    }

    s.screenCopy(168, 170, BACKBUF + 0x1afd8, 0x1afd8);
    s.drawSprite(SPRITE.ADWARE_BACKGROUND, BACKBUF + 0x1b261, 16);
    s.print('Компьютерная игра', BACKBUF + 0x1b4e9, 14, 8, 8);
    s.print('продается по адресу', BACKBUF + 0x26de1, 14, 8, 8);
    s.print('101000-Ц, МОСКВА,', BACKBUF + 0x281e9, 14, 8, 8);
    s.print('проезд Серова, 11.', BACKBUF + 0x295e5, 14, 8, 8);
    s.print('25 самых первых', BACKBUF + 0x2a9f1, 14, 8, 8);
    s.print('покупателей будут', BACKBUF + 0x2bde9, 14, 8, 8);
    s.print('приглашены со', BACKBUF + 0x2d1f9, 14, 8, 8);
    s.print('своими семьями', BACKBUF + 0x2e5f5, 14, 8, 8);
    s.print('на съемки телеигры', BACKBUF + 0x2f9e5, 14, 8, 8);
    s.print('ПОЛЕ ЧУДЕС!', BACKBUF + 0x31301, 14, 8, 8);

    let j = 0x33d58;
    let k = 120;
    for (let i = 79; i >= 0; i -= 1) {
      s.screenCopy(168, 160 - i - i, j, BACKBUF + 0x1b258);
      await this.m.audio.sound(k, 10);
      j -= 1280;
      k += 20;
      await this.delay(i >> 1);
    }
    await this.waitKey(INFINITE);
    s.drawSprite(SPRITE.YAKUBOVICH_BASE, 0xac * SCREEN_W + 0x1e0, 7);
    s.drawSprite(SPRITE.YAKUBOVICH_PASSIVE, 0xad * SCREEN_W + 0x1ff, 16);
    s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, 0xd1 * SCREEN_W + 0x214, 16);
  }

  /** DIFF #31: post-finals supergame for the tournament winner. */
  private async supergame(): Promise<void> {
    if (this.winner >= 3) {
      return;
    }

    this.supergameActive = true;
    this.supergamePlayer = this.winner;
    this.curPlayer = this.winner;
    this.stageBanner = SUPERGAME_BANNER;
    this.supergameBasket = buildPrizeBasket(this.seats[this.winner].score, {
      nextInt: (n) => this.random(n),
    });
    this.persistCheckpoint('supergame');

    this.setScene('supergame-setup');
    this.drawBoardChrome();
    this.syncPlayers(true);
    this.syncHud(true);
    this.playSfx('superGame');
    await this.yakubovichTalk(supergameGreeting());
    await this.yakubovichTalk(supergamePrizeIntro());

    this.setScene('supergame-prizes');
    this.ctx.supergameHud?.showPrizes(this.supergameBasket);
    if (this.isHuman(this.winner)) {
      await this.waitKey(INFINITE);
    } else {
      await this.delay(2500);
    }
    this.ctx.supergameHud?.hidePrizes();

    this.setScene('supergame-choice');
    const playSuper = this.isHuman(this.winner)
      ? (await this.playerDecision('Забираю  Супер', 'ПРИЗЫ   ИГРА', 'Забираю призы!', 'Супер-игра!')) > 0
      : true;
    if (!playSuper) {
      this.supergameWon = null;
      this.supergameAtRisk = false;
      this.supergameActive = false;
      this.stageBanner = null;
      return;
    }

    this.supergameAtRisk = true;
    this.wheelSuperMode = true;
    this.ctx.wheel?.setSuperMode(true);
    this.curSector = 0;
    this.superSector = 0;
    this.ctx.wheel?.setFrame(0);

    this.setScene('supergame-spin');
    await this.yakubovichTalk('Вращайте барабан супер-игры!');
    await this.playerConfirm('Кручу барабан!', { deferSpeech: true, measureHold: true });
    await Promise.all([this.playerSay('Кручу барабан!'), this.spinWheel()]);
    this.superPrize = superWheelPrizes()[this.superSector] ?? '';
    await this.yakubovichTalk(`Суперприз — ${this.superPrize}!`);

    await this.selectSupergameWord();

    const allowedLetters = Math.ceil(this.guessedWord.length / 2);
    this.setScene('supergame-letters');
    await this.yakubovichTalk(`Назовите ${allowedLetters} букв!`);
    for (let i = 0; i < allowedLetters; i += 1) {
      const letterIdx = await this.pickLetter();
      await this.openLetter(letterIdx, 0, { kind: 'keep' });
    }

    const solved = await this.thinkAndSolveSupergame();
    if (solved) {
      this.supergameWon = true;
      this.playSfx('fanfare');
      await this.yakubovichTalk('Вы выиграли супер-игру!');
      await this.yakubovichTalk(`Ваш суперприз — ${this.superPrize}!`);
    } else {
      this.supergameWon = false;
      this.supergameBasket = [];
      await this.yakubovichTalk('Вы проиграли супер-игру!');
      await this.yakubovichTalk('Призы на кон сгорают!');
    }

    this.wheelSuperMode = false;
    this.ctx.wheel?.setSuperMode(false);
    this.ctx.wheel?.setVisible(false);
    this.supergameActive = false;
    this.stageBanner = null;
    this.syncBoard(true);
    await this.waitKey(1500);
    await this.yakubovichSetSilent();
  }

  private async selectSupergameWord(): Promise<void> {
    this.setScene('word-select');
    const s = this.screen;
    const { questions } = this.ctx;
    if (questions.length === 0) {
      throw new Error('No questions loaded');
    }

    let curWord: number;
    if (questions.length >= TOURNAMENT_ROUNDS) {
      do {
        curWord = this.random(questions.length) + 1;
      } while (this.prevWords.includes(curWord));
    } else {
      curWord = this.random(questions.length) + 1;
    }

    const question = questions[curWord - 1];
    this.guessedWord = encodeCp866(question.word);
    this.remaindLetters = this.guessedWord.length;
    this.opened = new Array(this.guessedWord.length).fill(false);
    this.ctx.state.theme = question.theme;
    this.wordPos = 0x19 * SCREEN_W + 121 + 12 * 16 - ((this.remaindLetters >> 1) << 4);

    let j = 332 * SCREEN_W + 31 * 20;
    for (let i = 31; i >= 0; i -= 1) {
      this.available[i] = 0x80 + i;
      if (!this.ctx.alphabet) {
        s.drawSprite(SPRITE.LETTER_BACK0, j, 8);
      }
      j -= 20;
    }
    if (this.ctx.alphabet) {
      this.syncAlphabet(true);
    }

    if (this.ctx.board) {
      this.syncBoard(true);
    } else {
      for (let i = this.remaindLetters - 1; i >= 0; i -= 1) {
        s.fillRect((i << 4) + this.wordPos + 11 * SCREEN_W, 19, 14, 8);
      }
    }

    await this.yakubovichSetSilent();
    await this.yakubovichTalk('И вот задание на супер-игру.');
    await this.yakubovichSetSilent();
    await this.yakubovichTalk(question.theme);
    await this.yakubovichSetSilent();
    this.syncDebug();
  }

  /** Countdown HUD while waiting for Enter; returns true if Enter won. */
  private async waitEnterCountdown(seconds: number): Promise<boolean> {
    for (let sec = seconds; sec > 0; sec -= 1) {
      this.ctx.supergameHud?.setTimer(sec);
      if (await this.m.input.waitEnter(1000)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Super-game think minute (super-60s) with word entry open, then 15 s grace.
   * DIFF #31.
   */
  private async thinkAndSolveSupergame(): Promise<boolean> {
    this.setScene('supergame-think');
    // Drop a latched Enter from the letter-pick / drum confirm so the 60s bed
    // is not stopped on the first countdown poll.
    await this.m.input.waitEnter(0);
    this.playSfx('super60s', { loop: true, restart: true });

    if (!this.isHuman(this.curPlayer)) {
      this.ctx.supergameHud?.showTimer(60);
      for (let sec = 60; sec > 0; sec -= 1) {
        this.ctx.supergameHud?.setTimer(sec);
        await this.delay(1000);
      }
      this.stopSfx('super60s');
      this.ctx.supergameHud?.hideTimer();
      await this.yakubovichTalk('Время вышло! Назовите слово!');
      return this.tellWordSupergameNpc();
    }

    const s = this.screen;
    const { input } = this.m;
    const maxLen = this.guessedWord.length;
    const entry = input.beginTextEntry(maxLen, this.wordPos + 13 * SCREEN_W + 4, 16);
    const k = maxLen << 4;
    const board = this.ctx.board;
    let pollEntry: number | undefined;
    if (board) {
      pollEntry = window.setInterval(() => {
        board.setWordBoard(this.wordPos, this.wordBoardCells(new Uint8Array(entry.bytes)));
      }, 50);
      board.setWordBoard(this.wordPos, this.wordBoardCells(new Uint8Array(entry.bytes)));
    } else {
      s.screenCopy(k, 31, BACKBUF + this.wordPos, this.wordPos);
      let j = entry.ofs - 2 * SCREEN_W - 4;
      for (let i = maxLen; i >= 1; i -= 1) {
        s.fillRect(j, 19, 14, 7);
        j += 16;
      }
    }

    this.ctx.supergameHud?.showTimer(60);
    let submitted = await this.waitEnterCountdown(60);
    this.stopSfx('super60s');

    if (!submitted) {
      await this.yakubovichTalk('Время вышло! Назовите слово!');
      this.setScene('supergame-solve');
      this.ctx.supergameHud?.showTimer(15);
      submitted = await this.waitEnterCountdown(15);
    } else {
      this.setScene('supergame-solve');
    }
    this.ctx.supergameHud?.hideTimer();

    if (pollEntry !== undefined) {
      window.clearInterval(pollEntry);
    }
    input.endTextEntry();

    const typed = new Uint8Array(entry.bytes);
    if (board) {
      board.setWordBoard(this.wordPos, this.wordBoardCells());
    } else {
      s.screenCopy(k, 31, this.wordPos, BACKBUF + this.wordPos);
    }
    this.paintWordBoard();

    const match = typed.length === this.guessedWord.length
      && typed.every((b, idx) => b === this.guessedWord[idx]);
    await this.concludeSupergameAnswer(match);
    return match;
  }

  /**
   * Assistant flips every still-closed board cell, then the host speaks the
   * word (DIFF #31). Win/lose lines follow in the caller.
   */
  private async concludeSupergameAnswer(won: boolean): Promise<void> {
    await this.yakubovichSetSilent();
    await this.assistantRevealRemainingLetters();
    if (won) {
      this.playSfx('wordCorrect');
    } else {
      this.playSfx('wordWrongSuper');
    }
    await this.yakubovichTalk(decodeCp866(this.guessedWord));
    await this.yakubovichSetSilent();
  }

  /**
   * Walk the assistant across the board and open every still-closed letter
   * (same flip cadence as openLetter, without scoring or per-card sting).
   */
  private async assistantRevealRemainingLetters(opts?: { leadInMs?: number }): Promise<void> {
    const s = this.screen;
    const openBeforeWalk = new Set<number>();
    for (let j = 0; j < this.guessedWord.length; j += 1) {
      if (this.opened[j]) {
        openBeforeWalk.add(j);
      }
    }
    const assistStayWidth = 25;
    const wordCellWidth = 16;
    const assistStandShift = (assistStayWidth - wordCellWidth) >> 1;
    const assistPos: number[] = new Array(20).fill(0);
    assistPos[0] = 0x19 * SCREEN_W + 639;
    let k = 0;
    for (let j = this.guessedWord.length - 1; j >= 0; j -= 1) {
      if (!this.opened[j]) {
        k += 1;
        assistPos[k] = this.wordPos + (j << 4) - assistStandShift;
        this.opened[j] = true;
      }
    }
    this.remaindLetters = 0;
    this.syncDebug();
    if (k === 0) {
      this.syncBoard(true);
      this.paintWordBoard();
      return;
    }

    this.snapshotRoundToBackbuf();
    const leadInMs = opts?.leadInMs ?? 600;
    if (leadInMs > 0) {
      await this.delay(leadInMs);
    }

    const stepDelta = [3, 10, 0, 12];
    const stepSprite = [SPRITE.ASSIST_MOVE1, SPRITE.ASSIST_MOVE3, SPRITE.ASSIST_MOVE2, SPRITE.ASSIST_MOVE3];
    let i3 = 0;
    let walk = ASSIST_WALK_Y * SCREEN_W + ASSIST_WALK_X0;
    const revealed = new Set<number>();
    const assist = this.ctx.assist;
    const syncAssist = (ofs: number, spriteId: number): void => {
      if (assist) {
        assist.sync(true, ofs, spriteId);
      }
    };
    try {
      do {
        let blitOfs = walk;
        if (k > 0 && walk >= assistPos[k]) {
          walk = assistPos[k];
          blitOfs = walk;
          if (!assist) {
            s.drawSprite(SPRITE.ASSIST_STAY, blitOfs, 2);
          }
          syncAssist(blitOfs, SPRITE.ASSIST_STAY);
          const cellIdx = this.letterIndexAtAssist(assistPos[k]);
          const letterChar = decodeCp866(this.guessedWord.subarray(cellIdx, cellIdx + 1));
          if (this.ctx.board) {
            revealed.add(cellIdx);
            this.syncBoard(true, revealed, openBeforeWalk);
          } else {
            const f = BACKBUF + assistPos[k] + assistStandShift + 11 * SCREEN_W;
            s.fillRect(f, 19, 15, 7);
            s.print(letterChar, f + 4 + 2 * SCREEN_W, 0, 14, 8);
            s.screenCopy(15, 19, f - BACKBUF, f);
          }
          k -= 1;
          if (!assist) {
            s.drawSprite(SPRITE.ASSIST_STAY, blitOfs, 2);
          }
          syncAssist(blitOfs, SPRITE.ASSIST_STAY);
          await this.waitKey(450);
        } else {
          const nextStep = stepDelta[(i3 + 1) & 3];
          if (k > 0 && walk + nextStep >= assistPos[k]) {
            walk = assistPos[k];
            continue;
          }
          i3 = (i3 + 1) & 3;
          walk += stepDelta[i3];
          blitOfs = walk;
          if (!assist) {
            s.drawSprite(stepSprite[i3], walk, 2);
          }
          syncAssist(blitOfs, stepSprite[i3]);
          await this.m.audio.sound(this.random(100) + 1000, 7, { audible: true });
        }
        await this.delay(50);
        if (!assist) {
          s.screenCopy(48, 90, blitOfs, BACKBUF + blitOfs);
        }
      } while (walk < ASSIST_WALK_Y * SCREEN_W + ASSIST_WALK_X1);
    } finally {
      assist?.sync(false, 0, SPRITE.ASSIST_STAY);
    }

    this.syncBoard(true);
    this.paintWordBoard();
  }

  /** NPC-only super-game word attempt (DIFF #31). */
  private async tellWordSupergameNpc(): Promise<boolean> {
    this.setScene('supergame-solve');
    const trySolve = this.remaindLetters <= Math.max(1, Math.ceil(this.guessedWord.length / 3));
    const won = trySolve && this.random(4) > 0;
    await this.concludeSupergameAnswer(won);
    return won;
  }

  /** dpr:1558-1646 */
  private async endgame(): Promise<void> {
    const s = this.screen;
    const seat = this.seats[this.curPlayer];
    const name = decodeCp866(seat.nameBytes);
    this.hideWheel();

    if (this.winner < 3) {
      this.setScene('endgame');
      this.hideWheel();
      this.playSfx('fanfare');
      s.fillRect(0, 350, SCREEN_W, 7);
      s.drawSprite(SPRITE.LOGO_POLE, 10 * SCREEN_W + 10, 7);
      s.drawSprite(SPRITE.LOGO_CHUDES, 10 * SCREEN_W + 0xc8, 7);
      s.drawSprite(SPRITE.YAKUBOVICH_BASE, 0xac * SCREEN_W + 0x1e0, 7);
      s.drawSprite(SPRITE.YAKUBOVICH_PASSIVE, 0xad * SCREEN_W + 0x1ff, 16);
      s.drawSprite(SPRITE.YAKUBOVICH_EYES_OPEN, 0xd1 * SCREEN_W + 0x214, 16);

      const line1 = `Товарищ ${name}!`;
      s.print(line1, 0xbe * SCREEN_W + 0xf0 - (this.len(line1) << 2), 0, 14, 8);
      const line2 = this.supergameWon === true
        ? `Вы выиграли СУПЕР-ИГРУ и суперприз — ${this.superPrize}!`
        : this.supergameWon === false
          ? `Вы набрали ${seat.score} очков. Призы на кон сгорели.`
          : this.supergameBasket.length > 0
            ? `Вы забрали призы на ${basketTotal(this.supergameBasket)} рублей и набрали ${seat.score} очков!`
            : `Вы выиграли в ФИНАЛЕ и набрали ${seat.score} очков!`;
      s.print(line2, (0xbe + 0x12) * SCREEN_W + 0xf0 - (this.len(line2) << 2), 0, 14, 8);
      if (this.supergameWon === true || (this.supergameWon === null && this.supergameBasket.length > 0)) {
        const basketLine = this.supergameWon === true
          ? `Плюс суперприз: ${this.superPrize}`
          : 'Ваши призы:';
        s.print(basketLine, 0x2354c, 0, 14, 8);
        let prizeY = 0x2354c + 0x1e * SCREEN_W;
        for (const item of this.supergameBasket.slice(0, 4)) {
          const line = `• ${item.name} — ${item.rubles} руб.`;
          s.print(line, prizeY, 0, 14, 8);
          prizeY += 0x12 * SCREEN_W;
        }
      } else {
        s.print('Торговый дом ТУСАР и ПОЛЕ ЧУДЕС дарит Вам', 0x2354c, 0, 14, 8);
        const prize = `${PRIZES[this.random(PRIZES.length)]} компании PROCTER & GAMBLE!`;
        s.print(prize, (0xbe + 0x12 + 0x12 + 0x12) * SCREEN_W + 0xf0 - (this.len(prize) << 2), 0, 14, 8);
      }
      s.print('За ПРИЗОМ обращайтесь по адресу:', 0x28f70, 0, 14, 8);
      s.print('101000-Ц, Москва, проезд Серова, 11', 0x2bc64, 0, 14, 8);
      s.print('На конверте сделайте пометку КОМПЬЮТЕРНЫЙ ПРИЗ', 0x2e938, 0, 14, 8);
      s.print('Автор Дима Башуров из Российского Федерального Ядерного Центра', 0x33e48, 0, 8, 8);
      s.print('Телефон в Арзамасе-16 : (831-30) 5-92-73   E-mail: 0669 @ RFNC. NNOV. SU', 0x354a0, 0, 8, 8);
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

    s.fillRect(0xb25c * 8, 0xa0, 160, 0);
    s.print('8 лучших игроков,', BACKBUF + 0xaa * SCREEN_W + 0x1e9, 15, 14, 8);
    s.print('8 лучших игроков,', BACKBUF + 0xaa * SCREEN_W + 0x1e8, 15, 14, 8);
    s.print('выигравших ФИНАЛ!', BACKBUF + 0xb8 * SCREEN_W + 0x1e8, 15, 14, 8);
    s.print('выигравших ФИНАЛ!', BACKBUF + 0xb8 * SCREEN_W + 0x1e8, 15, 14, 8);
    let j = BACKBUF + 0x20a80;
    for (let i = 0; i < 8; i += 1) {
      const entry = top[i] ?? { name: '', score: 0 };
      const rank = `${i} ${entry.name}`; // 0-based ranks, as in the original (dpr:1623)
      s.print(rank, j + 0x1e1, 8, 14, 8);
      s.print(rank, j + 0x1e0, 8, 14, 8);
      const scoreText = `${entry.score}$`;
      const color = (i === inserted ? 2 : 0) + 3;
      s.print(scoreText, j + 0x24f, color, 14, 8);
      s.print(scoreText, j + 0x24e, color, 14, 8);
      j += 14 * SCREEN_W;
    }
    j = 0x32960;
    let k = 20;
    for (let i = 79; i >= 0; i -= 1) {
      await this.m.audio.sound(k, 10);
      s.screenCopy(152, 160 - i - i, j, BACKBUF + 0x19e60);
      j -= 1280;
      k += 20;
      await this.delay(i);
    }
    await this.waitKey(INFINITE);
    this.setScene('done');
    this.ctx.persist?.clear();
  }

  // ------------------------------------------------------------------- run

  async run(): Promise<void> {
    const resume = this.ctx.resume;
    if (resume) {
      this.applyResume(resume);
      this.ctx.present?.setMode('svg');
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
          this.playSfx('winnerTour');
          if (!roundWon) {
            // Word completed letter-by-letter: current player wins (dpr:1515-1518).
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
