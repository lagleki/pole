import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(webDir, '..');
const outputDir = path.resolve(repoDir, 'output', 'playwright');
const serverLogPath = path.join(outputDir, 'resume-audio-server.log');
const reportPath = path.join(outputDir, 'resume-audio-report.json');
const host = '127.0.0.1';
const port = Number.parseInt(process.env.POLE_RESUME_AUDIO_PORT ?? '4174', 10);
const baseUrl = `http://${host}:${port}`;
const headed = process.argv.includes('--headed');

const PROGRESS_STORAGE_KEY = 'pole-chudes-2:progress';
const PREFS_STORAGE_KEY = 'pole-chudes-2:prefs';

/** Between-rounds save: resume at stage-setup for tour 1 with playersEnter music. */
const BETWEEN_ROUNDS_SAVE = {
  version: 1,
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

let reportWritten = false;

function pnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function startDevServer() {
  const stdout = [];
  const stderr = [];
  const child = spawn(pnpmCommand(), ['run', 'dev', '--host', host, '--port', String(port), '--strictPort'], {
    cwd: webDir,
    env: {
      ...process.env,
      BROWSER: 'none',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    stdout.push(String(chunk));
  });
  child.stderr.on('data', (chunk) => {
    stderr.push(String(chunk));
  });

  return {
    child,
    async stop() {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await delay(500);
      }
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
      await writeFile(serverLogPath, `${stdout.join('')}\n${stderr.join('')}`.trimStart(), 'utf8');
    },
  };
}

async function waitForServer(server, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`Vite dev server exited early with code ${server.child.exitCode}`);
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the timeout expires.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for dev server at ${baseUrl}`);
}

function getSnapshot(page) {
  return page.evaluate(() => window.__poleDebug?.getSnapshot?.() ?? null);
}

function getAudioState(page) {
  return page.evaluate(() => window.__poleDebug?.getAudioState?.() ?? null);
}

async function waitForState(page, predicate, timeoutMs, pollMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snap = await getSnapshot(page);
    if (snap && predicate(snap)) {
      return snap;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await delay(pollMs);
  }
}

async function waitForAudioState(page, predicate, timeoutMs, pollMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const audio = await getAudioState(page);
    if (audio && predicate(audio)) {
      return audio;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await delay(pollMs);
  }
}

async function captureResumeAudioFlow() {
  await mkdir(outputDir, { recursive: true });

  const server = startDevServer();
  const consoleErrors = [];
  let browser;

  try {
    await waitForServer(server);

    browser = await chromium.launch({
      channel: 'chrome',
      headless: !headed,
    });
    const page = await browser.newPage({
      viewport: { width: 1400, height: 1200 },
    });

    page.on('console', (message) => {
      if (message.type() !== 'error') {
        return;
      }
      const text = message.text();
      if (/Failed to load resource:.*404/.test(text)) {
        return;
      }
      consoleErrors.push(`console.${message.type()}: ${text}`);
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(`pageerror: ${error.message}`);
    });

    await page.addInitScript(
      ({ progressKey, prefsKey, save, prefs }) => {
        localStorage.setItem(progressKey, JSON.stringify(save));
        localStorage.setItem(prefsKey, JSON.stringify(prefs));
      },
      {
        progressKey: PROGRESS_STORAGE_KEY,
        prefsKey: PREFS_STORAGE_KEY,
        save: BETWEEN_ROUNDS_SAVE,
        prefs: { soundEnabled: true, humanSeats: 1 },
      },
    );

    const pageUrl = `${baseUrl}/?testAudio=1`;
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

    const gate = page.locator('#audio-gate');
    await gate.waitFor({ state: 'visible', timeout: 30000 });

    await gate.click();

    const stageSetup = await waitForState(
      page,
      (snap) => snap.game?.scene === 'stage-setup' && snap.game.stage === 1,
      30000,
    );
    if (!stageSetup) {
      throw new Error('Timed out waiting for between-rounds stage-setup resume');
    }

    const audioPlaying = await waitForAudioState(
      page,
      (audio) =>
        audio.soundEnabled &&
        audio.sfxPrimed &&
        !audio.playersEnter.pending &&
        !audio.playersEnter.paused &&
        audio.playersEnter.currentTime > 0,
      8000,
    );

    const finalAudio = await getAudioState(page);
    const finalSnapshot = await getSnapshot(page);

    const assertions = [
      {
        name: 'audio-gate-dismissed-after-tap',
        pass: !(await gate.isVisible()),
      },
      {
        name: 'between-rounds-resume-at-stage-setup',
        pass: Boolean(stageSetup?.game?.scene === 'stage-setup' && stageSetup.game.stage === 1),
      },
      {
        name: 'sfx-primed-after-gate',
        pass: Boolean(finalAudio?.sfxPrimed),
      },
      {
        name: 'players-enter-playing-after-resume',
        pass: Boolean(audioPlaying),
      },
      {
        name: 'no-console-or-page-errors',
        pass: consoleErrors.length === 0,
      },
    ];

    const report = {
      baseUrl: pageUrl,
      assertions,
      finalAudio,
      finalSnapshot,
      consoleErrors,
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    reportWritten = true;

    const failed = assertions.filter((assertion) => !assertion.pass);
    if (failed.length > 0) {
      throw new Error(
        `Resume-audio assertions failed: ${failed.map((assertion) => assertion.name).join(', ')}` +
          (consoleErrors.length > 0 ? `\n${consoleErrors.join('\n')}` : '') +
          `\nFinal audio: ${JSON.stringify(finalAudio)}`,
      );
    }

    console.log(`Resume-audio OK — all ${assertions.length} assertions passed.`);
    for (const assertion of assertions) {
      console.log(`  PASS ${assertion.name}`);
    }
    console.log(`Report: ${reportPath}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.stop();
  }
}

captureResumeAudioFlow().catch(async (error) => {
  const summary = {
    baseUrl: `${baseUrl}/?testAudio=1`,
    error: error instanceof Error ? error.message : String(error),
  };
  await mkdir(outputDir, { recursive: true });
  if (!reportWritten) {
    await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  console.error(summary.error);
  process.exitCode = 1;
});
