import { encodeCp866 } from '../encoding/cp866';
import type { GlyphHeight, ScreenApi } from './types';
import { BUFFER_H, SCREEN_W } from './types';

interface SpriteData {
  width: number;
  height: number;
  pixels: Uint8Array;
}

interface FontPlanes {
  font6: Uint8Array;
  font8: Uint8Array;
  font14: Uint8Array;
}

/**
 * The DOS framebuffer: a single linear byte array of 640x750 indexed pixels.
 * Rows 0..349 are visible; the rest is scratch space (BACKBUF/BACKBUF2) used
 * by the game's save/restore idiom. Primitives intentionally do NOT clip to
 * row rectangles — writes run linearly and wrap across row edges exactly like
 * the original (dpr:247-281, 392-457); only out-of-buffer writes are ignored.
 */
export class Screen implements ScreenApi {
  readonly buffer = new Uint8Array(SCREEN_W * BUFFER_H);

  private sprites: readonly SpriteData[] = [];
  private fonts: FontPlanes | null = null;

  setSprites(sprites: readonly SpriteData[]): void {
    this.sprites = sprites;
  }

  getSprite(spriteId: number): SpriteData | undefined {
    return this.sprites[spriteId];
  }

  setFonts(fonts: FontPlanes): void {
    this.fonts = fonts;
  }

  /**
   * Save/restore buffer for one movable sprite ("save-behind" idiom).
   * Call saveBehind() before drawing; restoreBehind() before moving or hiding.
   * Works anywhere on the framebuffer — no BACKBUF dependency.
   */
  private behind: { ofs: number; width: number; height: number; pixels: Uint8Array } | null = null;

  saveBehind(ofs: number, width: number, height: number): void {
    const pixels = new Uint8Array(width * height);
    for (let row = 0; row < height; row += 1) {
      const src = ofs + row * SCREEN_W;
      pixels.set(this.buffer.subarray(src, src + width), row * width);
    }
    this.behind = { ofs, width, height, pixels };
  }

  restoreBehind(): void {
    const b = this.behind;
    if (!b) return;
    for (let row = 0; row < b.height; row += 1) {
      const dst = b.ofs + row * SCREEN_W;
      this.buffer.set(b.pixels.subarray(row * b.width, (row + 1) * b.width), dst);
    }
    this.behind = null;
  }

  /** dpr:247-281 — decoded-pixel equivalent of the row-RLE DrawSprite. */
  drawSprite(spriteId: number, ofs: number, transparentColor: number): void {
    const sprite = this.sprites[spriteId];
    if (!sprite) {
      return;
    }

    const { buffer } = this;
    const { width, height, pixels } = sprite;

    for (let row = 0; row < height; row += 1) {
      let dst = ofs + row * SCREEN_W;
      const src = row * width;

      for (let x = 0; x < width; x += 1, dst += 1) {
        const value = pixels[src + x];
        if (value !== transparentColor && dst >= 0 && dst < buffer.length) {
          buffer[dst] = value;
        }
      }
    }
  }

  /** dpr:342-390 — MSB-first 8px glyphs; set bits painted, clear bits left intact. */
  print(text: string | Uint8Array, ofs: number, color: number, glyphHeight: GlyphHeight, span: number): void {
    const fonts = this.fonts;
    if (!fonts) {
      return;
    }

    const font = glyphHeight === 6 ? fonts.font6 : glyphHeight === 8 ? fonts.font8 : fonts.font14;
    const bytes = typeof text === 'string' ? encodeCp866(text) : text;
    const { buffer } = this;

    for (let i = 0; i < bytes.length; i += 1) {
      const glyphBase = bytes[i] * glyphHeight;

      for (let row = 0; row < glyphHeight; row += 1) {
        const bits = font[glyphBase + row];
        if (bits === 0) {
          continue;
        }

        const rowOfs = ofs + i * span + row * SCREEN_W;
        for (let col = 0; col < 8; col += 1) {
          if ((bits & (0x80 >> col)) !== 0) {
            const dst = rowOfs + col;
            if (dst >= 0 && dst < buffer.length) {
              buffer[dst] = color;
            }
          }
        }
      }
    }
  }

  /** dpr:392-400 — `height` runs of `width` bytes at 640-byte stride. */
  fillRect(ofs: number, height: number, width: number, color: number): void {
    for (let row = 0; row < height; row += 1) {
      this.fillChar(ofs + row * SCREEN_W, width, color);
    }
  }

  /** Linear run fill (the raw `fillchar` idiom of the splash/board code). */
  fillChar(ofs: number, count: number, color: number): void {
    const start = Math.max(0, ofs);
    const end = Math.min(this.buffer.length, ofs + count);
    if (end > start) {
      this.buffer.fill(color, start, end);
    }
  }

  /** dpr:449-457 — row-strided copy between buffer regions. */
  screenCopy(width: number, height: number, dstOfs: number, srcOfs: number): void {
    const { buffer } = this;
    for (let row = 0; row < height; row += 1) {
      const src = srcOfs + row * SCREEN_W;
      const dst = dstOfs + row * SCREEN_W;
      if (src >= 0 && dst >= 0 && src + width <= buffer.length && dst + width <= buffer.length) {
        buffer.copyWithin(dst, src, src + width);
      }
    }
  }

  /** dpr:403-447 — splash-only 3px-wide grey line (Bresenham over the linear buffer). */
  line(x1: number, y1: number, x2: number, y2: number): void {
    const { buffer } = this;
    let pos = y1 * SCREEN_W + x1;

    let dx = x2 - x1;
    const stepX = dx < 0 ? -1 : 1;
    dx = Math.abs(dx);
    let dy = y2 - y1;
    const stepY = dy < 0 ? -SCREEN_W : SCREEN_W;
    dy = Math.abs(dy);

    let major = dx;
    let minor = dy;
    let majorStep = stepX;
    let minorStep = stepY;
    if (major <= minor) {
      [major, minor] = [minor, major];
      [majorStep, minorStep] = [minorStep, majorStep];
    }

    let error = major;
    for (let i = major; i > 0; i -= 1) {
      // The asm ORs three consecutive bytes with 7 (`or dword[edi-1],$070707`).
      for (let k = -1; k <= 1; k += 1) {
        const dst = pos + k;
        if (dst >= 0 && dst < buffer.length) {
          buffer[dst] |= 7;
        }
      }
      error -= minor;
      if (error <= 0) {
        error += major;
        pos += minorStep;
      }
      pos += majorStep;
    }

    if (pos >= 0 && pos < buffer.length) {
      buffer[pos] = 7;
    }
  }
}

/**
 * Browser frame loop for SVG play (hand cursor sync).
 * The DOS WM_TIMER caret/palette blit path is gone — gameplay is SVG-only.
 */
export interface PlayPresenter {
  start(): void;
  stop(): void;
}

/** @deprecated Alias kept so call sites can migrate off the canvas name. */
export type PresentMode = 'svg';

export class CanvasPresenter implements PlayPresenter {
  frame = 0;

  private rafId: number | null = null;
  private lastTime: number | null = null;
  private accumulator = 0;
  private readonly onFrame?: () => void;

  constructor(onFrame?: () => void) {
    this.onFrame = onFrame;
  }

  start(): void {
    if (this.rafId !== null) {
      return;
    }
    const tick = (time: number) => {
      if (this.lastTime !== null) {
        this.accumulator += time - this.lastTime;
      }
      this.lastTime = time;
      if (this.accumulator > 400) {
        this.accumulator = 400;
      }
      while (this.accumulator >= 20) {
        this.accumulator -= 20;
        this.frame += 1;
      }
      this.onFrame?.();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.lastTime = null;
    }
  }
}
