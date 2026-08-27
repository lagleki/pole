/**
 * Host TTS (DIFF #21).
 *
 * Linux Chrome/Chromium often ships with ZERO speechSynthesis voices
 * (needs speech-dispatcher). Native speak() then never starts and never
 * errors. We log the probe to the console and fall back to third-party
 * TTS audio (`<audio src>`, no CORS needed for playback):
 *   1. ResponsiveVoice «Russian Male»
 *   2. Google Translate TTS (female — last resort)
 * Native speechSynthesis is used only when a male Russian voice exists.
 *
 * speak() returns started/ended promises so the game can lip-sync and not
 * advance the turn until the line is finished. prime() must still run in a
 * click/key handler so autoplay allows the <audio> element to start.
 */

export interface HostSpeech {
  /** Resolves when the voice is actually audible (or given up). */
  started: Promise<void>;
  /** Resolves when the clip has finished (or given up). */
  ended: Promise<void>;
}

export type TtsRole = 'host' | 'male' | 'female';

export interface HostTts {
  speak(text: string, role?: TtsRole): HostSpeech;
  cancel(): void;
  prime(): void;
}

const ENDS_WITH_PUNCT = /[,:;—.–!?…]$/;
const STARTS_WITH_PUNCT = /^[,.;:!?…]/;
const STARTS_LOWER = /^[а-яёa-z]/;
/** Unofficial remote TTS query caps; keep a sentence end when clipping. */
const REMOTE_TTS_MAX = 200;

export function hostSpeechText(line1: string, line2: string): string {
  const parts = [line1, line2]
    .map((part) => spokenCasing(part.trim()))
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '';
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return joinSpokenLines(parts[0], parts[1]);
}

/** Keep commas/?/! from the oracle lines so the voice pauses. */
export function joinSpokenLines(a: string, b: string): string {
  if (ENDS_WITH_PUNCT.test(a) || STARTS_WITH_PUNCT.test(b)) {
    return `${a} ${b}`;
  }
  if (STARTS_LOWER.test(b)) {
    return `${a} ${b}`;
  }
  return `${a}, ${b.charAt(0).toLocaleLowerCase('ru-RU')}${b.slice(1)}`;
}

/** Recase shouty CP866 UI strings so the synthesiser reads words, not letters. */
export function spokenCasing(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const letters = trimmed.replace(/[^A-Za-zА-Яа-яЁё]/g, '');
  if (letters.length >= 2 && letters === letters.toUpperCase()) {
    return trimmed.charAt(0) + trimmed.slice(1).toLocaleLowerCase('ru-RU');
  }
  return trimmed;
}

/** Prefer clipping at punctuation so remote engines still see ? ! . , */
export function clipSpokenForRemote(text: string, max = REMOTE_TTS_MAX): string {
  if (text.length <= max) {
    return text;
  }
  const window = text.slice(0, max);
  let cut = -1;
  for (const mark of ['. ', '! ', '? ', '… ', '; ']) {
    cut = Math.max(cut, window.lastIndexOf(mark));
  }
  if (cut >= 24) {
    return window.slice(0, cut + 1).trimEnd();
  }
  const comma = window.lastIndexOf(', ');
  if (comma >= 24) {
    return window.slice(0, comma + 1).trimEnd();
  }
  return window.trimEnd();
}

const MALE_VOICE = /dmitry|dmitri|yuri|yury|pavel|andrei|andrey|filipp|philip|maxim|maksim|male|мужск/i;
const FEMALE_VOICE =
  /milena|katya|irina|iryna|elena|alena|tatyana|tatiana|xenia|ksenia|anna|maria|olga|svetlana|female|женск/i;

/** Male host voice only — female system voices are skipped for Yakubovich. */
export function pickRussianVoice(
  voices: readonly SpeechSynthesisVoice[],
  gender: 'male' | 'female' = 'male',
): SpeechSynthesisVoice | null {
  if (voices.length === 0) {
    return null;
  }
  const ru = voices.filter((item) => /^ru\b/i.test(item.lang));
  const pool = ru.length > 0 ? ru : [...voices];
  if (gender === 'female') {
    const named = pool.filter((item) => FEMALE_VOICE.test(item.name) && !MALE_VOICE.test(item.name));
    const ranked = named.length > 0 ? named : pool.filter((item) => !MALE_VOICE.test(item.name));
    const local = ranked.filter((item) => item.localService);
    return (local.length > 0 ? local : ranked)[0] ?? null;
  }
  const notFemale = pool.filter((item) => !FEMALE_VOICE.test(item.name));
  const candidates = notFemale.length > 0 ? notFemale : [];
  const local = candidates.filter((item) => item.localService);
  const ranked = (local.length > 0 ? local : candidates).slice();
  const male = ranked.find((item) => MALE_VOICE.test(item.name));
  return male ?? null;
}

export function googleTranslateTtsUrl(text: string): string {
  const q = encodeURIComponent(clipSpokenForRemote(text));
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ru&q=${q}`;
}

/** ResponsiveVoice Russian (host = Yakubovich; players use a different pitch). */
export function responsiveVoiceTtsUrl(text: string, role: TtsRole = 'host'): string {
  const q = encodeURIComponent(clipSpokenForRemote(text));
  if (role === 'female') {
    return `https://code.responsivevoice.org/getvoice.php?t=${q}&tl=ru&gender=female&vn=${encodeURIComponent('Russian Female')}&pitch=0.5&rate=0.5&vol=1`;
  }
  if (role === 'male') {
    return `https://code.responsivevoice.org/getvoice.php?t=${q}&tl=ru&gender=male&vn=${encodeURIComponent('Russian Male')}&pitch=0.58&rate=0.52&vol=1`;
  }
  return `https://code.responsivevoice.org/getvoice.php?t=${q}&tl=ru&gender=male&vn=${encodeURIComponent('Russian Male')}&pitch=0.4&rate=0.45&vol=1`;
}

const TTS_LOG = '[pole-tts]';

function log(...args: unknown[]): void {
  console.info(TTS_LOG, ...args);
}

function isWebDriver(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.webdriver);
}

export interface HostTtsOptions {
  getEnabled: () => boolean;
  announce?: (text: string) => void;
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

export function createHostTts(options: HostTtsOptions): HostTts {
  const synth = typeof globalThis !== 'undefined' ? globalThis.speechSynthesis : undefined;
  const canUseAudio = typeof Audio !== 'undefined';
  const player = canUseAudio ? new Audio() : null;
  let selectedVoice: SpeechSynthesisVoice | null = null;
  let pending: string | null = null;
  let pendingRole: TtsRole = 'host';
  let engine = 'none';
  let nativeKick = 0;
  let nativeWatch = 0;
  let currentNative: SpeechSynthesisUtterance | null = null;
  let startWaiter: (() => void) | null = null;
  let endWaiter: (() => void) | null = null;
  let startTimer = 0;
  let endTimer = 0;

  const refreshVoice = (gender: 'male' | 'female' = 'male'): SpeechSynthesisVoice[] => {
    const voices: SpeechSynthesisVoice[] = synth ? [...synth.getVoices()] : [];
    selectedVoice = pickRussianVoice(voices, gender);
    return voices;
  };

  if (synth?.addEventListener) {
    synth.addEventListener('voiceschanged', () => {
      const voices = refreshVoice();
      log(
        'voiceschanged',
        voices.length,
        'ru=',
        selectedVoice?.name ?? '(none)',
        voices.slice(0, 8).map((item) => `${item.name} [${item.lang}]`),
      );
    });
  }

  const voicesAtBoot = refreshVoice();
  log('boot', {
    speechSynthesis: Boolean(synth),
    voiceCount: voicesAtBoot.length,
    picked: selectedVoice,
    audioElement: Boolean(player),
    webdriver: isWebDriver(),
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
  });

  const stopNative = (): void => {
    if (nativeKick !== 0) {
      window.clearInterval(nativeKick);
      nativeKick = 0;
    }
    if (nativeWatch !== 0) {
      window.clearTimeout(nativeWatch);
      nativeWatch = 0;
    }
    currentNative = null;
    if (synth) {
      try {
        synth.cancel();
      } catch {
        // ignore
      }
    }
  };

  const clearLineTimers = (): void => {
    if (startTimer !== 0) {
      window.clearTimeout(startTimer);
      startTimer = 0;
    }
    if (endTimer !== 0) {
      window.clearTimeout(endTimer);
      endTimer = 0;
    }
  };

  const resolveStart = (): void => {
    if (startTimer !== 0) {
      window.clearTimeout(startTimer);
      startTimer = 0;
    }
    const done = startWaiter;
    startWaiter = null;
    done?.();
  };

  const resolveEnd = (): void => {
    resolveStart();
    clearLineTimers();
    pending = null;
    const done = endWaiter;
    endWaiter = null;
    done?.();
  };

  const stopRemote = (): void => {
    if (!player) {
      return;
    }
    player.onended = null;
    player.onerror = null;
    player.onplaying = null;
    try {
      player.pause();
    } catch {
      // ignore
    }
    player.removeAttribute('src');
    player.load();
  };

  const remoteUrls = (text: string, role: TtsRole): string[] => [
    responsiveVoiceTtsUrl(text, role),
    googleTranslateTtsUrl(text),
  ];

  const playRemote = (text: string, index: number, role: TtsRole): void => {
    if (!player || !options.getEnabled() || isWebDriver()) {
      log('remote skipped', { audio: Boolean(player), enabled: options.getEnabled(), webdriver: isWebDriver() });
      resolveEnd();
      return;
    }
    const urls = remoteUrls(text, role);
    const url = urls[index];
    if (!url) {
      engine = 'failed';
      log('all remote engines failed');
      resolveEnd();
      return;
    }
    engine = index === 0 ? `responsivevoice-${role}` : 'google-translate';
    log('remote play', engine, text);
    stopRemote();
    player.setAttribute('referrerpolicy', 'no-referrer');
    player.preload = 'auto';
    player.src = url;
    player.onplaying = () => {
      log('remote playing', engine);
      resolveStart();
    };
    player.onended = () => {
      log('remote ended', engine);
      resolveEnd();
    };
    player.onerror = () => {
      log('remote error', engine, player.error?.code);
      playRemote(text, index + 1, role);
    };
    const start = player.play();
    if (start) {
      void start.catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        log('remote play() rejected (need a click to unlock audio)', err.name, err.message);
        pending = text;
        pendingRole = role;
      });
    }
  };

  const speakNative = (text: string, role: TtsRole): boolean => {
    if (!synth || selectedVoice === null) {
      return false;
    }
    stopNative();
    const utterance = new SpeechSynthesisUtterance(text);
    currentNative = utterance;
    utterance.lang = selectedVoice.lang || 'ru-RU';
    utterance.voice = selectedVoice;
    if (role === 'host') {
      utterance.rate = 1.02;
      utterance.pitch = 0.88;
    } else if (role === 'female') {
      utterance.rate = 1.06;
      utterance.pitch = 1.12;
    } else {
      utterance.rate = 1.1;
      utterance.pitch = 1.15;
    }
    utterance.volume = 1;
    utterance.onstart = () => {
      log('native started');
      resolveStart();
    };
    utterance.onend = () => {
      if (currentNative === utterance) {
        log('native ended');
        stopNative();
        resolveEnd();
      }
    };
    utterance.onerror = (event) => {
      log('native error', event.error);
      if (currentNative === utterance) {
        stopNative();
        playRemote(text, 0, role);
      }
    };
    try {
      synth.resume();
      synth.speak(utterance);
      synth.resume();
    } catch (error) {
      log('native speak() threw', error);
      return false;
    }
    engine = `native-${role}`;
    log('native speak', selectedVoice.name, role, text);
    nativeKick = window.setInterval(() => {
      if (synth.speaking) {
        resolveStart();
      }
      if (synth.paused) {
        try {
          synth.resume();
        } catch {
          // ignore
        }
      }
    }, 250);
    nativeWatch = window.setTimeout(() => {
      if (!synth.speaking) {
        log('native did not start — falling back to remote TTS');
        stopNative();
        playRemote(text, 0, role);
      }
    }, 400);
    return true;
  };

  const dispatch = (text: string, role: TtsRole): void => {
    const gender = role === 'female' ? 'female' : 'male';
    const voices = refreshVoice(gender);
    log('dispatch', {
      text,
      role,
      enabled: options.getEnabled(),
      voiceCount: voices.length,
      picked: selectedVoice?.name ?? null,
    });
    if (!options.getEnabled()) {
      log('muted — not speaking');
      resolveEnd();
      return;
    }
    if (isWebDriver()) {
      log('webdriver — skip audible TTS');
      resolveEnd();
      return;
    }
    // Host: native male Yakubovich. Female players: native female if present.
    // Male players skip the host voice and use the remote male engine (DIFF #21).
    if (role !== 'male' && selectedVoice !== null && speakNative(text, role)) {
      return;
    }
    log(role === 'host' ? 'no usable system voice — using remote TTS' : 'player line — remote TTS');
    playRemote(text, 0, role);
  };

  return {
    prime(): void {
      log('prime (user gesture)');
      if (player && !player.paused && player.currentSrc && !player.currentSrc.startsWith('data:')) {
        log('prime: already playing');
        return;
      }
      if (player) {
        const prev = player.src;
        player.src = SILENT_WAV;
        void player.play().then(
          () => {
            player.pause();
            if (pending && options.getEnabled()) {
              log('prime: flushing pending', pending);
              dispatch(pending, pendingRole);
            } else if (prev && prev !== SILENT_WAV) {
              player.src = prev;
            }
          },
          (error: unknown) => {
            log('prime silent-play failed', error);
            if (pending && options.getEnabled()) {
              dispatch(pending, pendingRole);
            }
          },
        );
        return;
      }
      if (pending && options.getEnabled()) {
        dispatch(pending, pendingRole);
      }
    },

    cancel(): void {
      stopNative();
      stopRemote();
      resolveEnd();
    },

    speak(text: string, role: TtsRole = 'host'): HostSpeech {
      stopNative();
      stopRemote();
      const spoken = text.trim();
      const started = new Promise<void>((resolve) => {
        startWaiter = resolve;
      });
      const ended = new Promise<void>((resolve) => {
        endWaiter = resolve;
      });
      if (spoken.length === 0) {
        resolveEnd();
        return { started, ended };
      }
      options.announce?.(spoken);
      pending = spoken;
      pendingRole = role;
      if (typeof window !== 'undefined') {
        startTimer = window.setTimeout(() => {
          log('start watchdog — animating without confirmed audio');
          resolveStart();
        }, 8000);
        endTimer = window.setTimeout(() => {
          log('end watchdog — continuing the game');
          resolveEnd();
        }, 25000);
      } else {
        resolveEnd();
        return { started, ended };
      }
      dispatch(spoken, role);
      log('engine', engine);
      return { started, ended };
    },
  };
}

