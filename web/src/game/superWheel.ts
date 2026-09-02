/**
 * Seven-sector supergame drum (DIFF #31).
 */
import { SUPER_DRUM_PRIZES } from './supergamePrizes';

export const SUPER_WHEEL_SECTOR_COUNT = 7;
export const SUPER_WHEEL_STEP_DEG = 360 / SUPER_WHEEL_SECTOR_COUNT;

export function superWheelPrizes(): readonly string[] {
  return SUPER_DRUM_PRIZES;
}

/** Short label for a wedge (fits along the radial axis). */
export function superPrizeLabel(prize: string): string {
  if (prize.length <= 12) {
    return prize;
  }
  const words = prize.split(' ');
  if (words.length > 1 && words[0].length <= 12) {
    return words[0];
  }
  return `${prize.slice(0, 11)}…`;
}

export function superPrizeLabelFontSize(label: string): number {
  if (label.length <= 7) {
    return 10;
  }
  if (label.length <= 10) {
    return 8;
  }
  return 7;
}
