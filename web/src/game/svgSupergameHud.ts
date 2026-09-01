/**
 * Supergame prize list and think-timer overlay (DIFF #31).
 */
import type { SupergamePrize } from './supergamePrizes';
import { basketTotal, formatRubles } from './supergamePrizes';
import { escapeSvgText } from './svgHud';

export interface SupergameHudView {
  showPrizes(basket: readonly SupergamePrize[]): void;
  hidePrizes(): void;
  showTimer(seconds: number): void;
  setTimer(seconds: number): void;
  hideTimer(): void;
  setVisible(visible: boolean): void;
}

function prizeListMarkup(basket: readonly SupergamePrize[]): string {
  const rows = basket.map((item, i) => {
    const y = 52 + i * 22;
    return `<text x="24" y="${y}" class="sg-prize-item">${escapeSvgText(item.name)}</text>
      <text x="616" y="${y}" text-anchor="end" class="sg-prize-price">${escapeSvgText(formatRubles(item.rubles))}</text>`;
  }).join('');
  const total = formatRubles(basketTotal(basket));
  return `<rect x="8" y="8" width="624" height="334" rx="6" class="sg-panel"/>
    <text x="320" y="32" text-anchor="middle" class="sg-title">Ваши призы</text>
    ${rows}
    <line x1="24" y1="300" x2="616" y2="300" class="sg-divider"/>
    <text x="24" y="322" class="sg-total-label">Итого:</text>
    <text x="616" y="322" text-anchor="end" class="sg-total">${escapeSvgText(total)}</text>`;
}

function timerMarkup(seconds: number): string {
  return `<rect x="250" y="130" width="140" height="90" rx="8" class="sg-timer-panel"/>
    <text x="320" y="168" text-anchor="middle" class="sg-timer-label">Размышление</text>
    <text x="320" y="205" text-anchor="middle" class="sg-timer-value">${seconds}</text>`;
}

function buildSvg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 350"
      width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <style>
        .sg-panel { fill: rgba(8,12,22,0.92); stroke: #c8a030; stroke-width: 2; }
        .sg-title { font: 700 16px "PT Mono", ui-monospace, monospace; fill: #f0d878; }
        .sg-prize-item { font: 11px "PT Mono", ui-monospace, monospace; fill: #e8edf4; }
        .sg-prize-price { font: 11px "PT Mono", ui-monospace, monospace; fill: #a8d4ff; }
        .sg-divider { stroke: #4a5160; stroke-width: 1; }
        .sg-total-label { font: 700 12px "PT Mono", ui-monospace, monospace; fill: #e8edf4; }
        .sg-total { font: 700 14px "PT Mono", ui-monospace, monospace; fill: #f0d878; }
        .sg-timer-panel { fill: rgba(8,12,22,0.94); stroke: #c8a030; stroke-width: 2; }
        .sg-timer-label { font: 11px "PT Mono", ui-monospace, monospace; fill: #a8b0c0; }
        .sg-timer-value { font: 700 36px "PT Mono", ui-monospace, monospace; fill: #f0d878; }
      </style>
      ${inner}
    </svg>`;
}

export function mountSupergameHud(host: HTMLElement): SupergameHudView {
  host.hidden = true;
  let mode: 'hidden' | 'prizes' | 'timer' = 'hidden';

  const paint = (): void => {
    if (mode === 'hidden') {
      host.innerHTML = '';
      host.hidden = true;
    }
  };

  return {
    setVisible(visible: boolean): void {
      if (!visible) {
        host.hidden = true;
      } else if (mode !== 'hidden') {
        host.hidden = false;
      }
    },
    showPrizes(basket): void {
      mode = 'prizes';
      host.innerHTML = buildSvg(prizeListMarkup(basket));
      host.hidden = false;
    },
    hidePrizes(): void {
      if (mode === 'prizes') {
        mode = 'hidden';
        paint();
      }
    },
    showTimer(seconds): void {
      mode = 'timer';
      host.innerHTML = buildSvg(timerMarkup(seconds));
      host.hidden = false;
    },
    setTimer(seconds): void {
      if (mode === 'timer') {
        host.innerHTML = buildSvg(timerMarkup(seconds));
      }
    },
    hideTimer(): void {
      if (mode === 'timer') {
        mode = 'hidden';
        paint();
      }
    },
  };
}
