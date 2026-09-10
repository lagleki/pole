/**
 * Assistant stop lists for card-open walks.
 * Stops are data-first: left→right `{ cellIndex, standOfs }[]` — no DOS
 * 1-based sentinel table (`assistPos[0]=…`, `assistPos[hits]=…`).
 * The walker opens RIGHT→LEFT (last stop first).
 */
import {
  cellStandOfs,
  matchingLetterIndices,
  markCellsOpened,
} from './boardLetters';

export interface AssistStop {
  readonly cellIndex: number;
  readonly standOfs: number;
}

export type AssistStopList = readonly AssistStop[];

function stopsForCells(wordPos: number, cellIndices: readonly number[]): AssistStopList {
  return cellIndices.map((cellIndex) => ({
    cellIndex,
    standOfs: cellStandOfs(wordPos, cellIndex),
  }));
}

/**
 * Pure: stand stops for each match of `letterByte` (left→right).
 * Does not mutate `opened` — call {@link applyAssistStopsOpened} at the boundary.
 */
export function collectLetterHitStops(args: {
  readonly guessedWord: Uint8Array;
  readonly letterByte: number;
  readonly wordPos: number;
}): AssistStopList {
  const { guessedWord, letterByte, wordPos } = args;
  return stopsForCells(wordPos, matchingLetterIndices(guessedWord, letterByte));
}

/**
 * Pure: stand stops for every still-closed cell (left→right).
 * Does not mutate `opened` — call {@link applyAssistStopsOpened} at the boundary.
 */
export function collectClosedCellStops(args: {
  readonly guessedWord: Uint8Array;
  readonly opened: readonly boolean[];
  readonly wordPos: number;
}): AssistStopList {
  const { guessedWord, opened, wordPos } = args;
  const indices: number[] = [];
  for (const [i] of guessedWord.entries()) {
    if (!opened[i]) {
      indices.push(i);
    }
  }
  return stopsForCells(wordPos, indices);
}

/** Clear mutation boundary after collecting stops. */
export function applyAssistStopsOpened(opened: boolean[], stops: AssistStopList): void {
  markCellsOpened(
    opened,
    stops.map((s) => s.cellIndex),
  );
}

/** Stand offsets only (left→right), for callers that only need frame positions. */
export function standOfsList(stops: AssistStopList): readonly number[] {
  return stops.map((s) => s.standOfs);
}
