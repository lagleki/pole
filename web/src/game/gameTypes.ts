import type { OvlQuestion } from '../assets/ovl';
import type { TopPlayerRecord } from '../assets/pic';
import type { Machine } from '../engine/types';
import type { HostTts } from '../engine/tts';
import type { GameSfx } from '../engine/sfx';
import type { PlayPresenter } from '../engine/screen';
import type { GameProgressSave } from './persist';
import type { AlphabetView } from './svgAlphabet';
import type { BoardView } from './svgBoard';
import type { HudView } from './svgHud';
import type { AssistView } from './svgAssist';
import type { HandView } from './svgHand';
import type { LetterPadView } from './svgLetterPad';
import type { AdwareView } from './svgAdware';
import type { YakView } from './svgYakubovich';
import type { BoxesView } from './svgBoxes';
import type { CeremonyView } from './svgCeremony';
import type { SplashView } from './svgSplash';
import type { PlayersView } from './svgPlayers';
import type { StudioView } from './svgStudio';
import type { WheelView } from './svgWheel';
import type { SupergameHudView } from './svgSupergameHud';
import type { SupergamePrize } from './supergamePrizes';

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
  readonly name: string;
  readonly score: number;
  readonly isHuman: boolean;
  readonly removed: boolean;
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
  readonly humanSeats: 1 | 2;
  /**
   * DIFF #31: skip the 7 tournament stages and jump straight to the
   * super-game with a seeded human winner (URL `?supergame=1`).
   */
  readonly skipToSupergame?: boolean;
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
  /** SVG prize / endgame / top-8 ceremony (DIFF #19). */
  ceremony?: CeremonyView;
  /** SVG splash / intro (DIFF #19). */
  splash?: SplashView;
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
  /** SVG pointing hand (board / plus-sector position pick). Letter pick uses letterPad. */
  hand?: HandView;
  /** Full-screen clickable А–Я pad for human letter pick (4×8). */
  letterPad?: LetterPadView;
  /** Browser frame loop (hand cursor sync). Legacy canvas mode removed. */
  present?: PlayPresenter;
  /** Supergame prize list + think timer (DIFF #31). */
  supergameHud?: SupergameHudView;
}

/** Round seat (null spriteId = removed — original Sprite.ptr = nil). */
export interface GameSeat {
  spriteId: number | null;
  nameBytes: Uint8Array;
  score: number;
}

export type HumanSeatCount = GameOptions['humanSeats'];

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
