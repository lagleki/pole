import { describe, expect, it } from 'vitest';

import {
  YAK_BASE_OFS,
  YAK_BODY_OFS,
  YAK_EYES_HIGH_OFS,
  YAK_EYES_LOW_OFS,
} from './svgYakubovich';

describe('svg yakubovich', () => {
  it('keeps the DOS studio anchors for base, body and eyes', () => {
    expect(YAK_BASE_OFS % 640).toBe(0x1e0);
    expect(Math.floor(YAK_BASE_OFS / 640)).toBe(0xac);
    expect(YAK_BODY_OFS % 640).toBe(0x1ff);
    expect(Math.floor(YAK_BODY_OFS / 640)).toBe(0xad);
    expect(YAK_EYES_LOW_OFS % 640).toBe(0x214);
    expect(Math.floor(YAK_EYES_LOW_OFS / 640)).toBe(0xd1);
    expect(YAK_EYES_HIGH_OFS % 640).toBe(0x214);
    expect(Math.floor(YAK_EYES_HIGH_OFS / 640)).toBe(0xc9);
    expect(YAK_EYES_HIGH_OFS).toBe(YAK_EYES_LOW_OFS - 8 * 640);
  });
});
