/**
 * Stage / round open: studio reset, presentation, word blanks + theme announce
 * (dpr:990-1115). Host mirrors Game fields/methods used by the round-open loop.
 */
import type { OvlQuestion } from '../assets/ovl';
import { decodeCp866, encodeCp866 } from '../encoding/cp866';
import { BACKBUF, INFINITE, SCREEN_W, type Machine, type ScreenApi } from '../engine/types';
import { PLAYERS_ENTER_UNDER_HOST, PLAYERS_ENTER_VOLUME, type SfxId, type SfxPlayOptions } from '../engine/sfx';
import { defaultAssetSpec } from '../spec';
import { liveSeat } from './constants';
import type { GameContext, GameSeat, HumanSeatCount, Scene } from './gameTypes';
import type { GameProgressSave } from './persist';
import type { LetterAward } from './letterAward';
import {
  firstTourGreeting,
  firstTourInvite,
  laterTourGreeting,
  laterTourInvite,
  broadcastWeekday,
} from './hostIntro';
import { pickQuestionIndex, prepareRoundWord } from './roundWord';

const SPRITE = defaultAssetSpec.spriteIds;

export type WinnerCarry = {
  readonly seat: number;
  readonly spriteId: number | null;
  readonly nameBytes: Uint8Array;
  readonly score: number;
};

export interface StageRoundHost {
  readonly screen: ScreenApi;
  readonly m: Machine;
  readonly ctx: GameContext;
  readonly seats: GameSeat[];
  readonly available: Uint8Array;
  readonly prevWords: number[];
  readonly characters: { spriteId: number; name: string }[];
  readonly humanSeats: HumanSeatCount;
  stage: number;
  curSector: number;
  winner: number;
  charId: number;
  guessedWord: Uint8Array;
  remaindLetters: number;
  wordPos: number;
  opened: boolean[];
  hudIntroSeat: number | null;
  resumingBetweenRounds: boolean;
  winnerCarry: WinnerCarry | null;
  setScene(scene: Scene): void;
  persistCheckpoint(checkpoint: GameProgressSave['checkpoint'], award?: LetterAward, pick?: { letterIdx?: number; plusPosition?: number; boxChoice?: number; boxWinning?: number }): void;
  drawBoardChrome(): void;
  drawFortuneWheel(a: number): void;
  paintSeatSprite(seatIdx: number, spriteId?: number | null): void;
  paintScore(seatIdx: number): void;
  paintWordBoard(): void;
  syncPlayers(visible?: boolean): void;
  syncHud(visible?: boolean, blink?: { seat: number; on: boolean }): void;
  syncAlphabet(visible?: boolean): void;
  syncBoard(visible?: boolean, revealedDuringWalk?: ReadonlySet<number>, openBeforeWalk?: ReadonlySet<number>): void;
  syncDebug(): void;
  useSvgPlayers(): boolean;
  playSfx(id: SfxId, options?: SfxPlayOptions): void;
  stopSfx(id?: SfxId): void;
  setSfxVolume(id: SfxId, volume: number): void;
  updateMoney(seatIdx: number, fromScore: number): Promise<void>;
  yakubovichTalk(line1: string, line2?: string): Promise<void>;
  yakubovichSetSilent(): Promise<void>;
  delay(ms: number): Promise<void>;
  random(n: number): number;
}

/** dpr:990-1037 */
export async function stageSetup(host: StageRoundHost): Promise<void> {
  host.setScene('stage-setup');
  // DIFF #20: checkpoint before round-start music. A reload then re-enters
  // stageSetup and plays the bed again (after the audio gate), instead of
  // restoring into a moment that already "used" the cue.
  // Skip stage 0 first entry — seats have no names yet; between-rounds would
  // skip the presentation prompts via presentationFromSave.
  if (
    host.resumingBetweenRounds ||
    host.stage > 0 ||
    host.seats.some((seat) => seat.nameBytes.length > 0)
  ) {
    host.persistCheckpoint('between-rounds');
  }

  const s = host.screen;
  host.drawBoardChrome();

  if (!host.resumingBetweenRounds) {
    host.winnerCarry = null;
    if (host.winner >= 0 && host.winner <= 2) {
      const w = host.seats[host.winner];
      host.winnerCarry = {
        seat: host.winner,
        spriteId: w.spriteId,
        nameBytes: new Uint8Array(w.nameBytes),
        score: w.score,
      };
    }
    // Clear every seat visually — winner art/labels from the last round must not linger.
    for (const i of [0, 1, 2] as const) {
      const layout = liveSeat(i);
      host.seats[i].nameBytes = new Uint8Array(0);
      host.seats[i].spriteId = null;
      if (i !== host.winner) {
        host.seats[i].score = 0;
      }
      if (!host.useSvgPlayers()) {
        host.paintSeatSprite(i, null);
      }
      if (!host.ctx.hud) {
        s.fillRect(layout.labelOfs - 641, 30, 110, 0);
        s.fillRect(layout.labelOfs, 28, 108, 7);
        s.fillRect(layout.labelOfs + SCREEN_W * 14, 14, 80, 7);
        s.fillRect(layout.moneyOfs - 644, 30, 84, 7);
      }
    }
    host.hudIntroSeat = null;
    host.syncPlayers(true);
    host.syncHud(true);
  }
  host.ctx.hud?.hideBubbles();

  for (let i = 31; i >= 0; i -= 1) {
    host.available[i] = 0x80 + i;
  }
  if (!host.ctx.alphabet) {
    throw new Error('alphabet view required (SVG scene graph)');
  }
  host.syncAlphabet(false);

  // dpr:1034 — seats stay empty until presentation reveals them one by one.
  host.drawFortuneWheel(host.curSector);
  // WEB: letter blanks on the board from round start, before greetings and
  // before selectWord announces the question/theme.
  chooseRoundWord(host);
  host.stopSfx('opening');
  host.stopSfx('openingOld');
  // Music only after the between-rounds save and studio chrome are in place.
  if (host.stage > 0) {
    host.playSfx('sting');
  }
  host.playSfx('playersEnter', { volume: PLAYERS_ENTER_VOLUME, restart: true });
  // WEB DIFF #27: TV studio open (Wikiquote catchphrase + calendar weekday).
  if (host.stage === 0) {
    for (const line of firstTourGreeting(broadcastWeekday())) {
      await host.yakubovichTalk(line);
    }
    await host.yakubovichTalk(firstTourInvite());
  } else {
    if (host.resumingBetweenRounds) {
      await host.delay(800);
    } else {
      await host.delay(4000);
    }
    await host.yakubovichTalk(laterTourGreeting(host.stage));
    await host.yakubovichTalk(laterTourInvite(host.stage));
  }
}

/** Reload at between-rounds: redraw saved seats without wiping names or re-prompting. */
export async function presentationFromSave(host: StageRoundHost): Promise<void> {
  host.setScene('presentation');
  for (let j = 0; j <= 2; j += 1) {
    const seat = host.seats[j];
    if (j !== host.winner) {
      seat.score = 0;
    }
    if (seat.spriteId !== null) {
      host.paintSeatSprite(j, seat.spriteId);
    }
    host.paintScore(j);
  }
  host.drawFortuneWheel(host.curSector);
  host.syncHud(true);
  host.syncDebug();
  host.winner = 3;
  host.resumingBetweenRounds = false;
}

/** Seat caption blink (dpr:1047-1054) — name plate label only, no player name yet. */
export async function playCaptionIntro(host: StageRoundHost, seatIdx: number): Promise<void> {
  const s = host.screen;
  const layout = liveSeat(seatIdx);
  const hud = host.ctx.hud;
  const seat = host.seats[seatIdx];
  const savedName = seat.nameBytes;
  seat.nameBytes = new Uint8Array(0);
  host.hudIntroSeat = seatIdx;
  if (!hud) {
    s.fillRect(layout.labelOfs - 641, 30, 110, 0);
    s.fillRect(layout.labelOfs, 28, 108, 7);
  }
  for (let i = 3; i >= 0; i -= 1) {
    if (hud) {
      host.syncHud(true, { seat: seatIdx, on: (i & 1) === 1 });
    } else {
      s.print(layout.caption, layout.labelOfs + 14, (i & 1) * 7, 14, 8);
    }
    await host.m.audio.sound(i * 10 + 100, 20);
    await host.delay(120);
  }
  await host.m.audio.sound(50, 100);
  seat.nameBytes = savedName;
  host.syncHud(true, { seat: seatIdx, on: false });
}

/** dpr:1040-1087 — sprite first, then caption blink, then name (web order). */
export async function presentation(host: StageRoundHost): Promise<void> {
  if (host.resumingBetweenRounds) {
    await presentationFromSave(host);
    return;
  }
  host.setScene('presentation');
  const s = host.screen;
  const { input } = host.m;

  for (let j = 0; j <= 2; j += 1) {
    const seat = host.seats[j];
    const layout = liveSeat(j);
    const hud = host.ctx.hud;
    host.hudIntroSeat = j;

    if (j === host.winner && host.winnerCarry?.seat === j) {
      seat.spriteId = host.winnerCarry.spriteId;
      seat.nameBytes = new Uint8Array(host.winnerCarry.nameBytes);
      seat.score = host.winnerCarry.score;
      host.winnerCarry = null;
    } else if (j !== host.winner) {
      seat.nameBytes = new Uint8Array(0);
      seat.spriteId = null;
      seat.score = 0;
    }

    // Seat 0 is never prompted (dpr:1057); in 1-player web mode only
    // seat 1 is, in the original mode seats 1 and 2 both are.
    const prompted = j !== host.winner && j > 0 && j <= host.humanSeats;
    let captionDone = false;

    if (prompted) {
      seat.spriteId = SPRITE.PLAYER;
      host.paintSeatSprite(j, SPRITE.PLAYER);
      await host.delay(280);
      await playCaptionIntro(host, j);
      captionDone = true;

      await host.yakubovichSetSilent();
      // Name field open while the host says «представьтесь».
      const nameOfs = hud ? BACKBUF + SCREEN_W * 14 : layout.labelOfs + SCREEN_W * 14;
      const entry = input.beginTextEntry(10, nameOfs, 8);
      const pollName = hud
        ? globalThis.setInterval(() => {
            hud.setNameEntry({
              seat: j,
              text: decodeCp866(new Uint8Array(entry.bytes)),
              caret: Math.floor(Date.now() / 400) % 2 === 0,
            });
          }, 50)
        : 0;
      await Promise.all([
        host.yakubovichTalk('Пожалуйста, представьтесь!'),
        input.waitEnter(INFINITE),
      ]);
      if (hud) {
        globalThis.clearInterval(pollName);
        hud.setNameEntry(null);
      }
      input.endTextEntry();
      if (!hud) {
        s.fillRect(layout.labelOfs + SCREEN_W * 14, 14, 80, 7);
      }
      seat.nameBytes = new Uint8Array(entry.bytes);
    }

    if (j !== host.winner && seat.nameBytes.length === 0) {
      if (prompted && host.humanSeats === 1) {
        // WEB: 1-player mode keeps a human seat under a default name.
        seat.nameBytes = encodeCp866('ИГРОК');
        seat.spriteId = SPRITE.PLAYER;
      } else {
        // Empty name (or an unprompted seat): NPC takes it (dpr:1070-1077).
        const character = host.characters[host.charId];
        seat.spriteId = character.spriteId;
        seat.nameBytes = encodeCp866(character.name);
        host.charId = (host.charId + 1) % host.characters.length;
      }
    }

    if (seat.spriteId !== null) {
      host.paintSeatSprite(j, seat.spriteId);
      if (!captionDone) {
        await host.delay(280);
        await playCaptionIntro(host, j);
      }
    }

    if (!host.ctx.hud) {
      s.print(seat.nameBytes, layout.labelOfs + 54 - (seat.nameBytes.length << 2) + 14 * SCREEN_W, 0, 14, 8);
    }
    host.drawFortuneWheel(host.curSector);
    const moneyFrom = j === host.winner ? seat.score : 0;
    await host.updateMoney(j, moneyFrom);
    host.hudIntroSeat = null;
    host.syncHud(true);
    host.syncDebug();
    await host.delay(500);
  }
  host.hudIntroSeat = null;
  host.winnerCarry = null;
  host.winner = 3;
}

/**
 * Pick this stage's puzzle and paint letter blanks on the board.
 * Called from stageSetup so blanks are visible for the whole round open
 * (greetings + presentation) before selectWord announces the theme.
 * dpr:1091-1105 (selection + blank paint); announcement stays in selectWord.
 */
export function chooseRoundWord(host: StageRoundHost): OvlQuestion {
  const { questions } = host.ctx;
  const used = host.prevWords.slice(0, host.stage);
  const curWord = pickQuestionIndex(questions.length, used, (n) => host.random(n));
  host.prevWords[host.stage] = curWord;

  // Evidence-corrected OVL pairing: pair w = (word, theme) = parser questions[w-1]
  // (the literal Delphi indexing mispairs and overruns; see architecture.md).
  const prepared = prepareRoundWord(questions[curWord - 1]!);
  host.guessedWord = prepared.guessedWord;
  host.remaindLetters = prepared.remaindLetters;
  host.opened = prepared.opened;
  host.ctx.state.theme = prepared.theme;
  host.wordPos = prepared.wordPos;
  if (!host.ctx.board) {
    throw new Error('board view required (SVG scene graph)');
  }
  host.syncBoard(true);
  host.syncDebug();
  return prepared.question;
}

/** dpr:1091-1115 — announce theme; blanks were painted in stageSetup. */
export async function selectWord(host: StageRoundHost): Promise<void> {
  host.setScene('word-select');
  // stageSetup already chose and painted the word; keep a safe fallback.
  if (host.guessedWord.length === 0) {
    chooseRoundWord(host);
  } else {
    host.paintWordBoard();
  }
  const theme = host.ctx.state.theme;
  await host.yakubovichSetSilent();
  await host.yakubovichTalk('И вот задание на этот тур.');
  await host.yakubovichSetSilent();
  host.setSfxVolume('playersEnter', PLAYERS_ENTER_UNDER_HOST);
  await host.yakubovichTalk(theme);
  // DIFF #28: DOS waited for Space here; continue into the first spin.
  await host.yakubovichSetSilent();
  host.syncDebug();
}
