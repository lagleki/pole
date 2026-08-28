import { describe, expect, it } from 'vitest';

import {
  broadcastWeekday,
  firstTourGreeting,
  firstTourInvite,
  laterTourGreeting,
  laterTourInvite,
} from './hostIntro';
import { hostSpeechText } from '../engine/tts';

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
    expect(hostSpeechText(...lines[0])).toBe('Добрый вечер! Здравствуйте, уважаемые дамы и господа!');
    expect(hostSpeechText(...lines[1])).toBe('Пятница! В эфире капитал-шоу Поле чудес!');
    expect(hostSpeechText(...firstTourInvite())).toBe(
      'И как обычно, под аплодисменты зрительного зала, я рад представить вам тройку игроков!',
    );
  });

  it('re-opens later tours and the superfinal', () => {
    expect(hostSpeechText(...laterTourGreeting(1))).toBe('И вновь в эфире капитал-шоу Поле чудес!');
    expect(hostSpeechText(...laterTourInvite(1))).toBe('Приглашаю в студию новую тройку игроков!');
    expect(hostSpeechText(...laterTourGreeting(6))).toBe('Финал! В эфире капитал-шоу Поле чудес!');
    expect(hostSpeechText(...laterTourInvite(6))).toBe('Приглашаю в студию финальную тройку игроков!');
    expect(hostSpeechText(...laterTourGreeting(7))).toBe('Суперфинал! В эфире капитал-шоу Поле чудес!');
    expect(hostSpeechText(...laterTourInvite(7))).toBe('Приглашаю в студию участников суперфинала!');
  });
});
