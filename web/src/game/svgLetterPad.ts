/**
 * Full-screen clickable letter pad (presentation).
 * HTML/CSS 4×8 grid with large touch targets — replaces hand-on-alphabet-row.
 *
 * Layout note: 4×8 = 32 (not 4×7 = 28) so every А–Я letter fits.
 */
import { ALPHABET_LEN } from './constants';
import {
  LETTER_PAD_COLS,
  LETTER_PAD_LETTERS,
  LETTER_PAD_ROWS,
  isLetterPadAvailable,
  letterPadIndexFromChar,
} from './letterPadLayout';

export interface LetterPadView {
  /** Show pad with current availability; resolves to letter index 0..31. */
  show(available: Uint8Array): Promise<number>;
  hide(): void;
  setAvailable(available: Uint8Array): void;
}

interface PendingPick {
  resolve: (index: number) => void;
  reject: (reason?: unknown) => void;
}

function buildPadDom(): string {
  const tiles: string[] = [];
  for (let i = 0; i < ALPHABET_LEN; i += 1) {
    const ch = LETTER_PAD_LETTERS[i] ?? '';
    tiles.push(
      `<button type="button" class="letter-pad-tile" data-idx="${i}" aria-label="Буква ${ch}">${ch}</button>`,
    );
  }
  return `<div class="letter-pad" role="dialog" aria-modal="true" aria-label="Выберите букву">
    <p class="letter-pad-title">Назовите букву</p>
    <p class="letter-pad-note sr-only">Сетка 4×8 = 32 буквы А–Я (не 4×7=28)</p>
    <div class="letter-pad-grid" style="--letter-pad-cols: ${LETTER_PAD_COLS}; --letter-pad-rows: ${LETTER_PAD_ROWS}">
      ${tiles.join('')}
    </div>
  </div>`;
}

export function mountLetterPad(host: HTMLElement): LetterPadView {
  host.innerHTML = buildPadDom();
  host.hidden = true;
  host.classList.add('letter-pad-overlay');
  host.setAttribute('aria-hidden', 'true');

  const tiles = [...host.querySelectorAll<HTMLButtonElement>('.letter-pad-tile')];
  let pending: PendingPick | null = null;
  let availableSnap: Uint8Array = new Uint8Array(ALPHABET_LEN);

  const apply = (available: Uint8Array): void => {
    availableSnap = available;
    for (let i = 0; i < tiles.length; i += 1) {
      const tile = tiles[i];
      if (!tile) {
        continue;
      }
      const free = isLetterPadAvailable(available, i);
      tile.classList.toggle('used', !free);
      tile.disabled = !free;
      tile.setAttribute('aria-disabled', free ? 'false' : 'true');
      // Empty slot for already selected letters (keep aria-label for context).
      tile.textContent = free ? (LETTER_PAD_LETTERS[i] ?? '') : '';
    }
  };

  const settle = (index: number): void => {
    if (!pending) {
      return;
    }
    if (!isLetterPadAvailable(availableSnap, index)) {
      return;
    }
    const { resolve } = pending;
    pending = null;
    resolve(index);
  };

  const onPointer = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const tile = target.closest<HTMLButtonElement>('.letter-pad-tile');
    if (!tile || tile.disabled) {
      return;
    }
    event.preventDefault();
    const idx = Number.parseInt(tile.dataset.idx ?? '', 10);
    if (Number.isFinite(idx)) {
      settle(idx);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!pending || host.hidden) {
      return;
    }
    // Ignore when a modifier would mean something else (browser shortcuts).
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const idx = letterPadIndexFromChar(event.key);
    if (idx < 0) {
      return;
    }
    event.preventDefault();
    settle(idx);
  };

  // pointerdown for snappy mobile; click as fallback / accessibility.
  host.addEventListener('pointerdown', onPointer);
  host.addEventListener('click', onPointer);
  window.addEventListener('keydown', onKeyDown);

  return {
    setAvailable: apply,
    show(available: Uint8Array): Promise<number> {
      if (pending) {
        pending.reject(new DOMException('letter-pad-superseded', 'AbortError'));
        pending = null;
      }
      apply(available);
      host.hidden = false;
      host.setAttribute('aria-hidden', 'false');
      return new Promise<number>((resolve, reject) => {
        pending = { resolve, reject };
      });
    },
    hide(): void {
      host.hidden = true;
      host.setAttribute('aria-hidden', 'true');
      if (pending) {
        const { reject } = pending;
        pending = null;
        reject(new DOMException('letter-pad-hidden', 'AbortError'));
      }
    },
  };
}
