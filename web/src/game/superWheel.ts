/**
 * Seven-sector supergame drum (DIFF #31).
 */
import { SUPER_DRUM_PRIZES } from './supergamePrizes';

export const SUPER_WHEEL_SECTOR_COUNT = 7;
export const SUPER_WHEEL_STEP_DEG = 360 / SUPER_WHEEL_SECTOR_COUNT;

export function superWheelPrizes(): readonly string[] {
  return SUPER_DRUM_PRIZES;
}

/** Short label for a wedge (fits on the drum). */
export function superPrizeLabel(prize: string): string {
  if (prize.length <= 10) {
    return prize;
  }
  const words = prize.split(' ');
  if (words.length > 1 && words[0].length <= 10) {
    return words[0];
  }
  return `${prize.slice(0, 9)}…`;
}

export function superPrizeLabelFontSize(label: string): number {
  if (label.length <= 6) {
    return 11;
  }
  if (label.length <= 9) {
    return 9;
  }
  return 7;
}
