import { describe, expect, it } from 'vitest';

import {
  broadcastWeekday,
  firstTourGreeting,
  firstTourInvite,
  laterTourGreeting,
  laterTourInvite,
  supergameGreeting,
  supergamePrizeIntro,
} from './hostIntro';

describe('broadcastWeekday', () => {
  it('names Friday for a local Friday calendar date', () => {
    expect(broadcastWeekday(new Date(2026, 7, 28))).toBe('Пятница');
  });

  it('covers the whole week in getDay order', () => {
    expect(broadcastWeekday(new Date(2026, 7, 23))).toBe('Воскресенье');
    expect(broadcastWeekday(new Date(2026, 7, 24))).toBe('Понедельник');
    expect(broadcastWeekday(new Date(2026, 7, 29))).toBe('Суббота');
  });
});

describe('studio intro lines', () => {
  it('opens the first tour with the TV greeting and weekday', () => {
    const lines = firstTourGreeting('Пятница');
    expect(lines[0]).toBe('Добрый вечер! Здравствуйте, уважаемые дамы и господа!');
    expect(lines[1]).toBe('Пятница! В эфире капитал-шоу Поле чудес!');
    expect(firstTourInvite()).toBe(
      'И как обычно, под аплодисменты зрительного зала, я рад представить вам тройку игроков!',
    );
  });

  it('re-opens later tours and names the final', () => {
    expect(laterTourGreeting(1)).toBe('И вновь в эфире капитал-шоу Поле чудес!');
    expect(laterTourInvite(1)).toBe('Приглашаю в студию новую тройку игроков!');
    expect(laterTourGreeting(6)).toBe('Финал! В эфире капитал-шоу Поле чудес!');
    expect(laterTourInvite(6)).toBe('Приглашаю в студию финальную тройку игроков!');
  });

  it('introduces the super-game after the final', () => {
    expect(supergameGreeting()).toBe('Победитель финала! Сыграем в супер-игру?');
    expect(supergamePrizeIntro()).toBe('Вот что вы заработали в нашей программе!');
  });
});
