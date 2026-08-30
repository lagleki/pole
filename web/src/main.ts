import './style.css';
import { fntFromPlanes, type FntJson, type PoleFonts } from './assets/fnt';
import { libFromSprites, type LibJson, type PoleLib, type SpritePixels } from './assets/lib';
import { parseOvl, tourQuestionsFromJson, type OvlFile, type OvlQuestion, type TourQuestionsJson } from './assets/ovl';
import { picFromJson, type PicJson, type TopPlayerRecord } from './assets/pic';
import { cp866Length, decodeCp866 } from './encoding/cp866';
import { PwmAudio, WebAudioOutput } from './engine/audio';
import { createGameSfx } from './engine/sfx';
import { GameInput } from './engine/input';
import { BorlandRng } from './engine/rng';
import { CanvasPresenter, Screen } from './engine/screen';
import { RealClock } from './engine/timing';
import type { Machine } from './engine/types';
import { fontPlaneFromRgba, rgbaToIndexed, type RgbaImage } from './assets/spriteImage';
import { createDebugState, runGame, type GameDebugState } from './game/script';
import { defaultFlowSpec, defaultRenderSpec } from './spec';
import {
  clearProgress,
  loadPrefs,
  loadProgress,
  savePrefs,
  saveProgress,
} from './game/persist';
import { mountSvgAlphabet } from './game/svgAlphabet';
import { mountSvgBoard, punchOverlayHoles } from './game/svgBoard';
import { mountSvgHud } from './game/svgHud';
import { mountSvgHand } from './game/svgHand';
import { mountSvgWheel, punchWheelHole } from './game/svgWheel';
import { createHostTts } from './engine/tts';

const MAX_EDIT_ROWS = defaultFlowSpec.questionEditor.maxVisibleRows;
const MAX_PROMPT_CHARS = defaultFlowSpec.questionEditor.maxPromptChars;

interface PoleDebugSnapshot {
  activeTab: 'play' | 'admin';
  assetsReady: boolean;
  soundEnabled: boolean;
  questionCount: number;
  /** True while the game is collecting typed text (name or word entry). */
  textEntryActive: boolean;
  /** Live hand-cursor state during decision/letter scenes. */
  hand: { ofs: number; min: number; max: number; step: number } | null;
  game: GameDebugState | null;
}

interface PoleDebugApi {
  getSnapshot(): PoleDebugSnapshot;
  /** Synthetic input for the smoke harness (bypasses the DOM guards). */
  injectKey(key: string, mods?: { alt?: boolean; ctrl?: boolean }): void;
  injectKeyUp(key: string): void;
  injectClick(): void;
}

declare global {
  interface Window {
    __poleDebug?: PoleDebugApi;
  }
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root element');
}

app.innerHTML = `
  <main class="studio">
    <header class="masthead">
      <h1 class="wordmark" aria-label="Поле Чудес 2">ПОЛЕ&nbsp;ЧУДЕС&nbsp;<span class="wordmark-2">2</span></h1>
      <p class="tagline">КАПИТАЛ-ШОУ&nbsp;·&nbsp;DOS&nbsp;1993&nbsp;→&nbsp;TypeScript</p>
      <nav class="mode-tabs" role="tablist">
        <button id="tab-play" class="active" type="button" role="tab">Игра</button>
        <button id="tab-admin" type="button" role="tab">Настройки</button>
      </nav>
    </header>

    <section id="play-view" class="play-panel">
      <div class="crt-frame">
        <div id="screen-stack" class="screen-stack">
          <canvas id="screen" width="640" height="350" aria-label="Игровой экран"></canvas>
          <div id="board-overlay" class="board-overlay" hidden></div>
          <div id="plate-overlay" class="plate-overlay" hidden></div>
          <div id="wheel-overlay" class="wheel-overlay" hidden></div>
          <div id="alphabet-overlay" class="alphabet-overlay" hidden></div>
          <div id="wheel-pegs" class="wheel-pegs" hidden></div>
          <div id="hud-overlay" class="hud-overlay" hidden></div>
          <div id="hand-overlay" class="hand-overlay" hidden></div>
          <button id="audio-gate" class="audio-gate" type="button" hidden>
            Коснитесь экрана, чтобы включить звук
          </button>
        </div>
      </div>

      <div id="touch-controls" aria-label="Сенсорное управление">
        <button id="btn-left" type="button" class="key key-arrow" aria-label="Рука влево">◀</button>
        <button id="btn-space" type="button" class="key key-space">ПРОБЕЛ&nbsp;·&nbsp;ОК</button>
        <button id="btn-right" type="button" class="key key-arrow" aria-label="Рука вправо">▶</button>
        <button id="btn-enter" type="button" class="key key-enter">ВВОД</button>
      </div>

      <form id="entry-bar" autocomplete="off">
        <label for="entry-input" class="entry-label">Набор:</label>
        <input id="entry-input" type="text" autocapitalize="characters" autocorrect="off"
          spellcheck="false" enterkeyhint="done" lang="ru" placeholder="имя или слово…" />
        <button type="submit" class="key key-enter">ОК</button>
      </form>

      <div class="deck">
        <button id="restart-btn" type="button">Новая игра</button>
        <button id="sound-toggle" type="button">Звук: ВЫКЛ</button>
        <button id="fullscreen-btn" type="button">На весь экран</button>
      </div>

      <p id="host-speech" class="sr-only" aria-live="polite" aria-atomic="true"></p>

      <p class="hint keys-hint">ПРОБЕЛ / клик — подтвердить и пропустить паузы · ←/→ — рука ·
        ENTER — ввод имени/слова · буквы — набор текста · Ctrl+S — звук (голос ведущего и эффекты) · TAB — выключить звук · ESC — новая игра</p>
    </section>

    <section id="admin-view" class="admin-view is-hidden">
      <section class="panel">
        <h2>Режим игры</h2>
        <div class="controls">
          <label class="radio-option"><input type="radio" name="player-mode" value="1" checked />
            1 игрок + 2 НПС</label>
          <label class="radio-option"><input type="radio" name="player-mode" value="2" />
            2 игрока (как в оригинале)</label>
        </div>
        <p class="hint">В режиме «2 игрока» имя запрашивается у обоих; пустое имя отдаёт место НПС,
          как в оригинале. Смена режима сразу начинает новую игру.</p>
      </section>

      <section class="panel">
        <h2>Ресурсы</h2>
        <div class="controls">
          <button id="load-default" type="button">Перезагрузить оригинальные файлы</button>
          <label class="file-label">Загрузить банк <input id="ovl-input" type="file" accept=".json,.OVL,.ovl" /></label>
        </div>
        <pre id="asset-status">Not loaded.</pre>
      </section>

      <section class="panel">
        <h2>Редактор вопросов <small>(только на эту сессию)</small></h2>
        <div class="controls">
          <input id="search" type="search" placeholder="Фильтр по слову или вопросу" />
          <button id="add-question" type="button">Добавить вопрос</button>
          <button id="download-ovl" type="button" disabled>Скачать банк JSON</button>
          <label class="answers-toggle"><input id="answers-toggle" type="checkbox" />
            Показать и редактировать ответы</label>
        </div>
        <p class="hint">Показываются первые ${MAX_EDIT_ROWS} совпадений. Ответ — одно слово А–Я (до 20 букв).
          Вопрос читает ведущий вслух (до ${MAX_PROMPT_CHARS} знаков). Банк по умолчанию — выборка
          из Базы вопросов ЧГК (db.chgk.info), некоммерческая лицензия.</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Ответ</th><th>Вопрос (вслух)</th><th></th></tr>
            </thead>
            <tbody id="questions-body"></tbody>
          </table>
        </div>
      </section>
    </section>
  </main>
`;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const canvas = requireElement<HTMLCanvasElement>('#screen');
const screenStack = requireElement<HTMLDivElement>('#screen-stack');
const boardOverlay = requireElement<HTMLDivElement>('#board-overlay');
const audioGate = requireElement<HTMLButtonElement>('#audio-gate');
const plateOverlay = requireElement<HTMLDivElement>('#plate-overlay');
const wheelOverlay = requireElement<HTMLDivElement>('#wheel-overlay');
const alphabetOverlay = requireElement<HTMLDivElement>('#alphabet-overlay');
const hudOverlay = requireElement<HTMLDivElement>('#hud-overlay');
const handOverlay = requireElement<HTMLDivElement>('#hand-overlay');
const wheelPegs = requireElement<HTMLDivElement>('#wheel-pegs');
const tabPlayBtn = requireElement<HTMLButtonElement>('#tab-play');
const tabAdminBtn = requireElement<HTMLButtonElement>('#tab-admin');
const playView = requireElement<HTMLElement>('#play-view');
const adminView = requireElement<HTMLElement>('#admin-view');
const restartBtn = requireElement<HTMLButtonElement>('#restart-btn');
const soundToggleBtn = requireElement<HTMLButtonElement>('#sound-toggle');
const fullscreenBtn = requireElement<HTMLButtonElement>('#fullscreen-btn');
const loadDefaultBtn = requireElement<HTMLButtonElement>('#load-default');
const downloadOvlBtn = requireElement<HTMLButtonElement>('#download-ovl');
const addQuestionBtn = requireElement<HTMLButtonElement>('#add-question');
const ovlInput = requireElement<HTMLInputElement>('#ovl-input');
const searchInput = requireElement<HTMLInputElement>('#search');
const statusEl = requireElement<HTMLPreElement>('#asset-status');
const questionsBody = requireElement<HTMLTableSectionElement>('#questions-body');
const answersToggle = requireElement<HTMLInputElement>('#answers-toggle');
const btnLeft = requireElement<HTMLButtonElement>('#btn-left');
const btnRight = requireElement<HTMLButtonElement>('#btn-right');
const btnSpace = requireElement<HTMLButtonElement>('#btn-space');
const btnEnter = requireElement<HTMLButtonElement>('#btn-enter');
const entryBar = requireElement<HTMLFormElement>('#entry-bar');
const entryInput = requireElement<HTMLInputElement>('#entry-input');
const entryLabel = requireElement<HTMLLabelElement>('#entry-bar .entry-label');
const hostSpeechLive = requireElement<HTMLParagraphElement>('#host-speech');

const svgWheel = mountSvgWheel(wheelOverlay, wheelPegs);
const svgBoard = mountSvgBoard(boardOverlay);
const svgAlphabet = mountSvgAlphabet(alphabetOverlay);
const svgHud = mountSvgHud(plateOverlay, hudOverlay);
const svgHand = mountSvgHand(handOverlay);

// ------------------------------------------------------------ session state

/** Stable array instances: the running game holds references to these. */
const sessionQuestions: OvlQuestion[] = [];
const sessionTopPlayers: TopPlayerRecord[] = [];

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const speedFactor = Math.max(0.1, Number.parseFloat(params.get('fast') ?? '1') || 1);

let assetsReady = false;
let spriteLib: PoleLib | null = null;
let fontPlanes: PoleFonts | null = null;

// One audio output for the whole session (its AudioContext unlocks on first gesture).
const audioOutput = new WebAudioOutput();
let soundEnabled: boolean = true;
const persistEnabled = Number.isNaN(seedParam) && speedFactor === 1;
const bootPrefs = persistEnabled ? loadPrefs() : {};
if (typeof bootPrefs.soundEnabled === 'boolean') {
  soundEnabled = bootPrefs.soundEnabled;
}

interface RunHandle {
  controller: AbortController;
  input: GameInput;
  audio: PwmAudio;
  state: GameDebugState;
}

let currentRun: RunHandle | null = null;
let runCounter = 0;
/** Game-mode setting (session-only): 1 = human + 2 NPCs (default), 2 = original prompts. */
let humanSeats: 1 | 2 = bootPrefs.humanSeats === 2 ? 2 : 1;

const hostTts = createHostTts({
  getEnabled: () => soundEnabled,
  announce: (text) => {
    hostSpeechLive.textContent = text;
  },
});
const gameSfx = createGameSfx({ getEnabled: () => soundEnabled });

function setActiveTab(mode: 'play' | 'admin'): void {
  const playActive = mode === 'play';
  tabPlayBtn.classList.toggle('active', playActive);
  tabAdminBtn.classList.toggle('active', !playActive);
  playView.classList.toggle('is-hidden', !playActive);
  adminView.classList.toggle('is-hidden', playActive);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function updateSoundButton(): void {
  soundToggleBtn.textContent = `Звук: ${soundEnabled ? 'ВКЛ' : 'ВЫКЛ'}`;
}

function persistUiPrefs(): void {
  if (!persistEnabled) {
    return;
  }
  savePrefs({ soundEnabled, humanSeats });
}

function setSoundEnabled(value: boolean): void {
  soundEnabled = value;
  if (currentRun) {
    currentRun.audio.enabled = value;
  }
  if (value) {
    audioOutput.unlock().catch(() => {});
    void Promise.all([hostTts.prime(), gameSfx.prime()]);
  } else {
    hostTts.cancel();
    gameSfx.stop();
  }
  updateSoundButton();
  persistUiPrefs();
}

function discardRunAndProgress(reason: string): void {
  if (persistEnabled) {
    clearProgress();
  }
  hostTts.cancel();
  svgWheel.setVisible(false);
  svgBoard.setVisible(false);
  abortCurrentRun(reason);
}

// --------------------------------------------------------------- admin view

function summarizeState(): void {
  const lines = [
    `POLE2.LIB sprites: ${spriteLib ? spriteLib.spriteCount : 0}`,
    `POLE.FNT loaded: ${fontPlanes ? 'yes' : 'no'}`,
    `Банк туров: ${sessionQuestions.length} вопросов`,
    'POLE.PIC top players (session):',
    ...sessionTopPlayers.map((p, idx) => `${idx + 1}. ${p.name} - ${p.score}`),
  ];
  statusEl.textContent = lines.join('\n');
}

function makeInput(value: string, questionIndex: number, field: 'word' | 'theme'): string {
  const escaped = value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<input data-question-index="${questionIndex}" data-field="${field}" value="${escaped}" />`;
}

function renderQuestions(): void {
  const filter = searchInput.value.trim().toUpperCase();
  const showAnswers = answersToggle.checked;
  const rows: string[] = [];

  for (let i = 0; i < sessionQuestions.length; i += 1) {
    const q = sessionQuestions[i];
    const haystack = `${q.word} ${q.theme}`.toUpperCase();
    if (filter.length > 0 && !haystack.includes(filter)) {
      continue;
    }
    const wordTooLong = cp866Length(q.word) > 20;
    const promptTooLong = q.theme.length > MAX_PROMPT_CHARS;
    const wordCell = showAnswers
      ? makeInput(q.word, i, 'word')
      : `<span class="masked-word" title="Ответ скрыт">${'•'.repeat(Math.min(q.word.length, 20))}<small>${q.word.length}</small></span>`;
    const promptCell = `<textarea data-question-index="${i}" data-field="theme" rows="3">${q.theme
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')}</textarea>`;
    rows.push(`
      <tr>
        <td>${i + 1}</td>
        <td class="${wordTooLong ? 'invalid' : ''}">${wordCell}</td>
        <td class="${promptTooLong ? 'invalid' : ''}">${promptCell}</td>
        <td><button data-delete-index="${i}" type="button">✕</button></td>
      </tr>
    `);
    if (rows.length >= MAX_EDIT_ROWS) {
      break;
    }
  }

  questionsBody.innerHTML = rows.join('');
  downloadOvlBtn.disabled = sessionQuestions.length === 0;
}

function normalizeWord(input: string): string {
  return input.toUpperCase().replaceAll('Ё', 'Е').trim();
}

/**
 * Words must be pure А..Я (CP866 0x80..0x9F): the engine derives alphabet
 * indices as byte-0x80, and a word with any other character can never be
 * completed or solved (dpr:1027, 1276-1290, 1393-1396).
 */
function sanitizeGameWord(input: string): string {
  return normalizeWord(input).replace(/[^А-Я]/gu, '');
}

// ---------------------------------------------------------------- game loop

function abortCurrentRun(reason: string): void {
  currentRun?.controller.abort(new DOMException(reason, 'AbortError'));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function gameLoop(): Promise<void> {
  for (;;) {
    while (sessionQuestions.length === 0) {
      await sleep(500);
    }
    runCounter += 1;
    const controller = new AbortController();
    const { signal } = controller;

    const screen = new Screen();
    if (spriteLib) {
      screen.setSprites(spriteLib.sprites);
    }
    if (fontPlanes) {
      screen.setFonts(fontPlanes);
    }

    const clock = new RealClock(speedFactor, signal);
    const rng = new BorlandRng(Number.isNaN(seedParam) ? (Date.now() ^ (runCounter << 16)) >>> 0 : seedParam >>> 0);
    const input = new GameInput(screen, clock, signal);
    const audio = new PwmAudio(clock, rng, audioOutput);
    audio.enabled = soundEnabled;
    audio.playSpeechPwm = false;
    audio.playPwm = false;

    input.onEscape = () => {
      // WEB: the original Esc called ExitProcess (dpr:725); we restart to the splash.
      discardRunAndProgress('escape-restart');
    };
    input.onBossKey = () => {
      setSoundEnabled(false);
    };
    input.onToggleSound = () => {
      setSoundEnabled(!soundEnabled);
    };

    const machine: Machine = { screen, input, audio, clock, rng, signal };
    const state = createDebugState();
    currentRun = { controller, input, audio, state };
    const assistBlit: { current: { ofs: number; spriteId: number } | null } = { current: null };

    const presenter = new CanvasPresenter(
      screen,
      canvas,
      defaultRenderSpec.palette,
      () => input.textEntry,
      (rgba) => {
        const hand = input.hand;
        const handActive = hand.step === 16 || hand.step === 20;
        svgHand.sync(handActive, hand.ofs);

        if (!wheelOverlay.hidden) {
          punchWheelHole(rgba, null);
        }
        if (!boardOverlay.hidden) {
          let boardKeep = null;
          if (assistBlit.current) {
            const assistSprite = screen.getSprite(assistBlit.current.spriteId);
            if (assistSprite) {
              boardKeep = {
                ofs: assistBlit.current.ofs,
                width: assistSprite.width,
                height: assistSprite.height,
                pixels: assistSprite.pixels,
                transparent: 2,
              };
            }
          }
          punchOverlayHoles(rgba, boardKeep);
        }
      },
    );
    presenter.start();

    const resume = persistEnabled ? loadProgress() : null;
    if (resume) {
      humanSeats = resume.humanSeats;
      for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="player-mode"]')) {
        radio.checked = radio.value === String(humanSeats);
      }
      sessionTopPlayers.length = 0;
      sessionTopPlayers.push(...resume.topPlayers.map((row) => ({ ...row })));
    }

    try {
      await runGame({
        machine,
        questions: sessionQuestions,
        topPlayers: sessionTopPlayers,
        state,
        options: { humanSeats },
        wheel: svgWheel,
        board: svgBoard,
        assistBlit,
        alphabet: svgAlphabet,
        hud: svgHud,
        hand: svgHand,
        persist: persistEnabled
          ? { save: saveProgress, clear: clearProgress }
          : undefined,
        resume: resume ?? undefined,
        tts: hostTts,
        sfx: gameSfx,
      });
    } catch (error) {
      if (!signal.aborted) {
        console.error(error);
        await sleep(1700);
      }
    } finally {
      hostTts.cancel();
      gameSfx.stop();
      presenter.stop();
      svgWheel.setVisible(false);
      svgBoard.setVisible(false);
      svgAlphabet.setVisible(false);
      svgHud.setVisible(false);
      svgHud.hideBubbles();
      svgHand.setVisible(false);
      currentRun = null;
    }
    summarizeState();
    await sleep(300);
  }
}

// ------------------------------------------------------------------ wiring

function unlockAudio(): void {
  audioOutput.unlock().catch(() => {
    // Autoplay policy may reject before the first gesture; harmless.
  });
  void Promise.all([hostTts.prime(), gameSfx.prime()]);
}

function skipAudioGate(): boolean {
  return Boolean(typeof navigator !== 'undefined' && navigator.webdriver) || speedFactor !== 1;
}

async function waitForAudioGesture(): Promise<void> {
  if (skipAudioGate()) {
    await Promise.all([hostTts.prime(), gameSfx.prime()]);
    return;
  }
  gameSfx.warmup();
  audioGate.hidden = false;
  await new Promise<void>((resolve) => {
    let done = false;
    const go = (): void => {
      if (done) {
        return;
      }
      done = true;
      audioGate.hidden = true;
      audioOutput.unlock().catch(() => {});
      void Promise.all([hostTts.prime(), gameSfx.prime()]).finally(() => {
        resolve();
      });
    };
    audioGate.addEventListener('pointerdown', go, { once: true });
    audioGate.addEventListener('click', go, { once: true });
  });
}

function toggleFullscreen(): void {
  // WEB: the original's Alt+Enter hotkey (dpr:1653, 692-705).
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
  } else {
    void screenStack.requestFullscreen().catch(() => {});
  }
}

document.addEventListener('keydown', (event) => {
  const run = currentRun;
  if (!run || playView.classList.contains('is-hidden') || isTypingTarget(event.target)) {
    return;
  }
  // Layout-independent like the original VK_S hotkey (dpr:1652) — on a
  // Cyrillic layout event.key for the physical S key is 'ы'.
  if (event.ctrlKey && (event.code === 'KeyS' || event.key === 's' || event.key === 'S')) {
    event.preventDefault();
    setSoundEnabled(!soundEnabled);
    return;
  }
  if (event.altKey && event.key === 'Enter') {
    event.preventDefault();
    toggleFullscreen();
    return;
  }
  if (event.key === 'Escape') {
    run.input.onEscape?.();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    run.input.onBossKey?.();
    return;
  }
  if (event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Backspace') {
    // Enter included so a previously clicked (still focused) button is not re-activated.
    event.preventDefault();
  }
  unlockAudio();
  run.input.handleKey(event.key, { alt: event.altKey, ctrl: event.ctrlKey });
});

document.addEventListener('keyup', (event) => {
  currentRun?.input.handleKeyUp(event.key);
});

canvas.addEventListener('pointerdown', () => {
  unlockAudio();
  currentRun?.input.pointerDown();
});

canvas.addEventListener('pointerup', () => {
  currentRun?.input.pointerUp();
});

tabPlayBtn.addEventListener('click', () => {
  setActiveTab('play');
});
tabAdminBtn.addEventListener('click', () => {
  setActiveTab('admin');
});

restartBtn.addEventListener('click', () => {
  discardRunAndProgress('manual-restart');
});

soundToggleBtn.addEventListener('click', () => {
  setSoundEnabled(!soundEnabled);
});

fullscreenBtn.addEventListener('click', () => {
  toggleFullscreen();
});
if (typeof document.documentElement.requestFullscreen !== 'function') {
  // iPhone Safari has no element fullscreen API.
  fullscreenBtn.classList.add('is-hidden');
}

// --------------------------------------------------- touch controls (Safari)

// Reveal the on-screen keys once a real touch happens (plus the CSS
// pointer:coarse media query for first paint).
window.addEventListener(
  'pointerdown',
  (event) => {
    if (event.pointerType === 'touch') {
      document.body.classList.add('touch');
    }
  },
  { capture: true },
);

/**
 * On-screen key with HOLD semantics: pointer down = key held (the game's
 * hand loops POLL the KeyPressed event, so a fire-and-release tap would be
 * consumed by nothing), pointer up/cancel = key released. Arrows auto-repeat
 * like a held keyboard key.
 */
function bindHoldKey(button: HTMLButtonElement, key: string, autoRepeat = false): void {
  let repeatTimer: number | null = null;
  const stopRepeat = (): void => {
    if (repeatTimer !== null) {
      window.clearTimeout(repeatTimer);
      repeatTimer = null;
    }
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    unlockAudio();
    currentRun?.input.handleKey(key);
    if (autoRepeat) {
      stopRepeat();
      const tick = (): void => {
        currentRun?.input.handleKey(key);
        repeatTimer = window.setTimeout(tick, 130);
      };
      repeatTimer = window.setTimeout(tick, 380);
    }
  });
  const release = (): void => {
    stopRepeat();
    currentRun?.input.handleKeyUp(key);
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
}

bindHoldKey(btnLeft, 'ArrowLeft', true);
bindHoldKey(btnRight, 'ArrowRight', true);
bindHoldKey(btnSpace, ' ');
bindHoldKey(btnEnter, 'Enter');

// ------------------------------------------- mobile text entry (iOS Safari)

/** Mirrors what the game has actually accepted into its CP866 buffer. */
let entryForwarded = '';
let entryWasActive = false;

window.setInterval(() => {
  const entry = currentRun?.input.textEntry ?? null;
  const active = entry !== null;
  entryBar.classList.toggle('active', active);
  if (!active) {
    if (entryInput.value.length > 0) {
      entryInput.value = '';
    }
    entryForwarded = '';
    entryWasActive = false;
    return;
  }
  const naming = currentRun?.state.scene === 'presentation';
  entryLabel.textContent = naming ? 'Имя:' : 'Слово:';
  entryInput.placeholder = naming ? 'как вас зовут…' : 'загаданное слово…';
  entryInput.maxLength = entry.maxLen;
  if (!entryWasActive && !playView.classList.contains('is-hidden')) {
    entryInput.focus();
  }
  entryWasActive = true;
  if (document.activeElement !== entryInput) {
    const accepted = decodeCp866(new Uint8Array(entry.bytes));
    entryInput.value = accepted;
    entryForwarded = accepted;
  }
}, 150);

entryInput.addEventListener('input', () => {
  const run = currentRun;
  const entry = run?.input.textEntry;
  if (!run || !entry) {
    return;
  }
  const next = entryInput.value;
  let common = 0;
  while (common < entryForwarded.length && common < next.length && entryForwarded[common] === next[common]) {
    common += 1;
  }
  for (let i = entryForwarded.length; i > common; i -= 1) {
    run.input.handleKey('Backspace');
  }
  for (const ch of next.slice(common)) {
    run.input.handleKey(ch);
  }
  // The game is authoritative (uppercase, CP866 filter, max length).
  const accepted = decodeCp866(new Uint8Array(entry.bytes));
  entryForwarded = accepted;
  if (entryInput.value !== accepted) {
    entryInput.value = accepted;
  }
});

entryBar.addEventListener('submit', (event) => {
  event.preventDefault();
  currentRun?.input.handleKey('Enter');
  currentRun?.input.handleKeyUp('Enter');
  entryInput.blur();
});

answersToggle.addEventListener('change', () => {
  renderQuestions();
});

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="player-mode"]')) {
  radio.addEventListener('change', () => {
    const mode = radio.value === '2' ? 2 : 1;
    if (mode !== humanSeats) {
      humanSeats = mode;
      persistUiPrefs();
      discardRunAndProgress('mode-change');
    }
  });
}

searchInput.addEventListener('input', () => {
  renderQuestions();
});

questionsBody.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;
  if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
    return;
  }
  const idx = Number.parseInt(target.dataset.questionIndex ?? '', 10);
  const field = target.dataset.field;
  if (Number.isNaN(idx) || (field !== 'word' && field !== 'theme')) {
    return;
  }
  if (field === 'word') {
    const clean = sanitizeGameWord(target.value);
    if (clean.length === 0) {
      target.value = sessionQuestions[idx].word;
      return;
    }
    sessionQuestions[idx].word = clean;
  } else {
    sessionQuestions[idx].theme = target.value.trim().slice(0, MAX_PROMPT_CHARS);
  }
});

questionsBody.addEventListener('click', (event) => {
  const target = event.target as HTMLButtonElement;
  if (target.tagName !== 'BUTTON') {
    return;
  }
  const idx = Number.parseInt(target.dataset.deleteIndex ?? '', 10);
  if (Number.isNaN(idx)) {
    return;
  }
  sessionQuestions.splice(idx, 1);
  summarizeState();
  renderQuestions();
});

addQuestionBtn.addEventListener('click', () => {
  // The placeholder word must be pure А..Я — a space would make the round unwinnable.
  sessionQuestions.push({
    word: 'НОВОЕСЛОВО',
    theme: 'Как называют слово, которого ещё нет в банке этого тура?',
  });
  summarizeState();
  renderQuestions();
});

downloadOvlBtn.addEventListener('click', () => {
  try {
    const pack: TourQuestionsJson = {
      format: 'pole-tour-questions',
      version: 1,
      questions: sessionQuestions.map((q) => ({ word: q.word, theme: q.theme })),
    };
    const blob = new Blob([`${JSON.stringify(pack, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFlowSpec.questionEditor.exportFileName;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusEl.textContent = `Serialize error: ${message}`;
  }
});

// ------------------------------------------------------------ asset loading

function publicAsset(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}${path.replace(/^\//, '')}`;
}

async function fetchJsonAsset<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Fetches and decodes one of the lossless WebP asset images to raw RGBA.
 * Decoding must be exact for rgbaToIndexed to recover the palette indices;
 * createImageBitmap is asked to skip color-space conversion, with an
 * HTMLImageElement fallback for browsers that reject those options (the
 * images are untagged sRGB and fully opaque, so both paths decode 1:1).
 */
async function fetchWebpAsset(path: string): Promise<RgbaImage> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  const blob = await response.blob();

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to decode ${path}`));
      };
      image.src = url;
    });
  }

  const width = source.width;
  const height = source.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('2d canvas context unavailable for asset decoding');
  }
  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, width, height);
  return { width, height, rgba: new Uint8Array(imageData.data.buffer, 0, width * height * 4) };
}

async function fetchLibSprite(file: string): Promise<SpritePixels> {
  const image = await fetchWebpAsset(publicAsset(`assets/${file}`));
  return {
    width: image.width,
    height: image.height,
    pixels: rgbaToIndexed(image, defaultRenderSpec.palette),
  };
}

function applyQuestionPack(questions: OvlQuestion[]): void {
  sessionQuestions.length = 0;
  sessionQuestions.push(...questions);
}

function applyOvl(parsedOvl: OvlFile): void {
  applyQuestionPack(parsedOvl.questions);
}

async function loadBundledAssets(): Promise<void> {
  statusEl.textContent = 'Loading bundled assets...';
  const [libJson, fntJson, tourJson, picJson] = await Promise.all([
    fetchJsonAsset<LibJson>(publicAsset('assets/POLE2.LIB.json')),
    fetchJsonAsset<FntJson>(publicAsset('assets/POLE.FNT.json')),
    fetchJsonAsset<TourQuestionsJson>(publicAsset('assets/tour-questions.json')),
    fetchJsonAsset<PicJson>(publicAsset('assets/POLE.PIC.json')),
  ]);
  const [libSprites, fntAtlases] = await Promise.all([
    Promise.all(libJson.sprites.map((sprite) => fetchLibSprite(sprite.file))),
    Promise.all(fntJson.planes.map((plane) => fetchWebpAsset(publicAsset(`assets/${plane.file}`)))),
  ]);

  spriteLib = libFromSprites(libJson, libSprites);
  fontPlanes = fntFromPlanes(
    fntJson,
    fntJson.planes.map((plane, i) => fontPlaneFromRgba(fntAtlases[i], plane.height)),
  );
  applyQuestionPack(tourQuestionsFromJson(tourJson));
  sessionTopPlayers.length = 0;
  sessionTopPlayers.push(...picFromJson(picJson));

  summarizeState();
  renderQuestions();
  gameSfx.warmup();

  if (!assetsReady) {
    assetsReady = true;
    void waitForAudioGesture().then(() => gameLoop());
  } else {
    abortCurrentRun('assets-reloaded');
  }
}

loadDefaultBtn.addEventListener('click', () => {
  loadBundledAssets().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    statusEl.textContent = `Load error: ${message}`;
  });
});

ovlInput.addEventListener('change', async (event) => {
  const inputEl = event.currentTarget as HTMLInputElement;
  const file = inputEl.files?.[0];
  if (!file) {
    return;
  }
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith('.json')) {
      const parsed = JSON.parse(new TextDecoder().decode(buffer)) as TourQuestionsJson;
      applyQuestionPack(tourQuestionsFromJson(parsed));
    } else {
      applyOvl(parseOvl(buffer));
    }
    summarizeState();
    renderQuestions();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusEl.textContent = `Question pack load error: ${message}`;
  }
});

// ----------------------------------------------------------------- debug API

window.__poleDebug = {
  getSnapshot(): PoleDebugSnapshot {
    const run = currentRun;
    return {
      activeTab: playView.classList.contains('is-hidden') ? 'admin' : 'play',
      assetsReady,
      soundEnabled,
      questionCount: sessionQuestions.length,
      textEntryActive: run !== null && run.input.textEntry !== null,
      hand: run ? { ...run.input.hand } : null,
      game: run ? { ...run.state } : null,
    };
  },
  injectKey(key, mods) {
    currentRun?.input.handleKey(key, mods ?? {});
  },
  injectKeyUp(key) {
    currentRun?.input.handleKeyUp(key);
  },
  injectClick() {
    currentRun?.input.pointerDown();
    currentRun?.input.pointerUp();
  },
};

// -------------------------------------------------------------------- boot

updateSoundButton();
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="player-mode"]')) {
  radio.checked = radio.value === String(humanSeats);
}
setActiveTab('play');
loadBundledAssets().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  statusEl.textContent = `Load error: ${message}`;
});
