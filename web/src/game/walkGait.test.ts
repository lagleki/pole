import { describe, expect, it } from 'vitest';
import { nextGaitPhase, type WalkDir } from './walkGait';

describe('walkGait', () => {
  it('advances forward and reverse through four phases', () => {
    let phase = 0;
    const forward: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      phase = nextGaitPhase(phase, 1 satisfies WalkDir);
      forward.push(phase);
    }
    expect(forward).toEqual([1, 2, 3, 0]);

    phase = 0;
    const reverse: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      phase = nextGaitPhase(phase, -1 satisfies WalkDir);
      reverse.push(phase);
    }
    expect(reverse).toEqual([3, 2, 1, 0]);
  });
});
