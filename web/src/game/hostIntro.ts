/**
 * WEB studio greeting (DIFF #27). Wording follows the TV catchphrase
 * (Wikiquote / эфир Первого канала), with the calendar weekday in place of
 * the show's usual «Пятница!». Each cue is one spoken line for TTS.
 */

const WEEKDAYS_RU = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
] as const;

export function broadcastWeekday(now = new Date()): string {
  return WEEKDAYS_RU[now.getDay()];
}

/** Opening of the first tour: greeting, then invite after the applause bed. */
export function firstTourGreeting(weekday: string): readonly string[] {
  return [
    'Добрый вечер! Здравствуйте, уважаемые дамы и господа!',
    `${weekday}! В эфире капитал-шоу Поле чудес!`,
  ];
}

export function firstTourInvite(): string {
  return 'И как обычно, под аплодисменты зрительного зала, я рад представить вам тройку игроков!';
}

/** Later tours: shorter re-open, then a new triple. */
export function laterTourGreeting(stage: number): string {
  if (stage === 6) {
    return 'Финал! В эфире капитал-шоу Поле чудес!';
  }
  return 'И вновь в эфире капитал-шоу Поле чудес!';
}

export function laterTourInvite(stage: number): string {
  if (stage === 6) {
    return 'Приглашаю в студию финальную тройку игроков!';
  }
  return 'Приглашаю в студию новую тройку игроков!';
}

/** Supergame intro after the final round (DIFF #31). */
export function supergameGreeting(): string {
  return 'Победитель финала! Сыграем в суперигру?';
}

export function supergamePrizeIntro(): string {
  return 'Вот что вы заработали в нашей программе!';
}
