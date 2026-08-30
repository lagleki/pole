import { describe, expect, it } from 'vitest';

import {
  buildHudSvg,
  moneyStackCount,
  moneyStackMarkup,
  moneyTopBillOrigin,
  BILL_H,
  BILL_W,
  nameCaretX,
  usdBillArtMarkup,
} from './svgHud';

describe('svg hud money and name entry', () => {
  it('emits money groups without clipping the pile to the drum hole', () => {
    const svg = buildHudSvg();
    expect(svg).toContain('id="hud-money-row"');
    expect(svg).toContain('class="hud-money"');
    expect(svg).toContain('class="hud-caret"');
    expect(svg.match(/id="hud-money-row"[^>]*>/)?.[0]).not.toContain('clip-path');
    expect(usdBillArtMarkup()).toContain('#6fbf63');
  });

  it('applies recount jitter to the Snickers bar', () => {
    expect(moneyStackMarkup(0, { x: 4, y: -3 })).toContain('translate(4.0 -3.0)');
  });

  it('shows the Snickers bar at score 0 and grows the green bill stack above that', () => {
    expect(moneyStackCount(0)).toBe(0);
    expect(moneyStackCount(350)).toBe(1);
    expect(moneyStackCount(1000)).toBe(2);
    expect(moneyStackCount(5000)).toBe(5);
    expect(moneyStackMarkup(5000)).toContain('>5000</text>');
    const zero = moneyStackMarkup(0);
    expect(zero).toContain('hud-candy');
    expect(zero).toContain('hud-snickers');
    expect(zero).toContain('#eb1928');
    expect(zero).toContain('#234aa3');
    expect(zero).not.toContain('hud-bill');
    expect(zero).not.toContain('hud-score');
    const pile = moneyStackMarkup(1500, { x: 3, y: -2 });
    expect(pile.match(/class="hud-bill"/g)?.length).toBe(3);
    const top = moneyTopBillOrigin(3, { x: 3, y: -2 });
    expect(pile).toContain(`x="${(top.x + BILL_W / 2).toFixed(1)}"`);
    expect(pile).toContain(`y="${(top.y + BILL_H / 2).toFixed(1)}"`);
    expect(pile).toContain('>1500</text>');
  });

  it('places the name caret after the typed glyphs', () => {
    expect(nameCaretX('')).toBe(8);
    expect(nameCaretX('ИЯ')).toBeGreaterThan(nameCaretX('И'));
  });
});
