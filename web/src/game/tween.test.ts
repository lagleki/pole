import { describe, expect, it } from 'vitest';
import { animate, animateFrames } from './tween';

describe('tween', () => {
  it('animate samples 0..1 inclusive', async () => {
    const samples: number[] = [];
    await animate({
      durationMs: 40,
      steps: 4,
      onUpdate: (t) => {
        samples.push(t);
      },
      delay: async () => {},
    });
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(1);
    expect(samples).toHaveLength(5);
  });

  it('animateFrames preserves DOS-style delay schedule', async () => {
    const frames: number[] = [];
    const delays: number[] = [];
    await animateFrames({
      frameCount: 3,
      delayMs: (frame) => 30 - frame,
      onFrame: (frame) => {
        frames.push(frame);
      },
      delay: async (ms) => {
        delays.push(ms);
      },
    });
    expect(frames).toEqual([0, 1, 2]);
    expect(delays).toEqual([30, 29, 28]);
  });
});
