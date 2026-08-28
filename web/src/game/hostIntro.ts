/**
 * WEB studio greeting (DIFF #27). Wording follows the TV catchphrase
 * (Wikiquote / эфир Первого канала), with the calendar weekday in place of
 * the show's usual «Пятница!».
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

export type HostLine = readonly [string, string];

/** Opening of the first tour: greeting, then invite after the applause bed. */
export function firstTourGreeting(weekday: string): readonly HostLine[] {
  return [
    ['Добрый вечер!', 'Здравствуйте, уважаемые дамы и господа!'],
    [`${weekday}!`, 'В эфире капитал-шоу Поле чудес!'],
  ];
}

export function firstTourInvite(): HostLine {
  return [
    'И как обычно, под аплодисменты зрительного зала,',
    'я рад представить вам тройку игроков!',
  ];
}

/** Later tours: shorter re-open, then a new triple (or the superfinal). */
export function laterTourGreeting(stage: number): HostLine {
  if (stage >= 7) {
    return ['Суперфинал!', 'В эфире капитал-шоу Поле чудес!'];
  }
  if (stage === 6) {
    return ['Финал!', 'В эфире капитал-шоу Поле чудес!'];
  }
  return ['И вновь в эфире', 'капитал-шоу Поле чудес!'];
}

export function laterTourInvite(stage: number): HostLine {
  if (stage >= 7) {
    return ['Приглашаю в студию', 'участников суперфинала!'];
  }
  if (stage === 6) {
    return ['Приглашаю в студию', 'финальную тройку игроков!'];
  }
  return ['Приглашаю в студию', 'новую тройку игроков!'];
}
