import type { TtsRole } from '../engine/tts';
import { FEMALE_CHARACTER_SPRITES } from './constants';

/** Male given names that end in а/я but stay male for TTS (DIFF #21). */
const MALE_A_YA_NAMES: ReadonlySet<string> = new Set([
  'илья',
  'никита',
  'савва',
  'фома',
  'кузьма',
  'лука',
]);

/** Maps a single Cyrillic letter (А–Я) to its spoken name for TTS. */
const LETTER_NAMES: Readonly<Record<string, string>> = {
  А: 'А',
  Б: 'Бэ',
  В: 'Вэ',
  Г: 'Гэ',
  Д: 'Дэ',
  Е: 'Е',
  Ж: 'Жэ',
  З: 'Зэ',
  И: 'И',
  Й: 'И краткое',
  К: 'Ка',
  Л: 'Эль',
  М: 'Эм. Михаил',
  Н: 'Эн. Николай',
  О: '"Оо" - Олег',
  П: 'Пэ',
  Р: 'Эр',
  С: 'Эс',
  Т: 'Тэ',
  У: 'У',
  Ф: 'Эф',
  Х: 'Ха',
  Ц: 'Цэ',
  Ч: 'Чэ',
  Ш: 'Ша',
  Щ: 'Ща',
  Ъ: 'Твёрдый знак',
  Ы: 'Ы',
  Ь: 'Мягкий знак',
  Э: 'Э оборотное',
  Ю: 'Ю',
  Я: 'Я',
};

export function letterName(ch: string): string {
  return LETTER_NAMES[ch] ?? ch;
}

export function letterReplica(ch: string, n: number): { readonly display: string; readonly spoken: string } {
  if (n === 0) {
    return { display: `Буква ${ch}`, spoken: `Буква - ${letterName(ch)}` };
  }
  const line = `${n}-я буква`;
  return { display: line, spoken: line };
}

/** DIFF #21: NPC gender from sprite; human seat from name ending (а/я → female, with male exceptions). */
export function playerVoiceRole(spriteId: number | null, name: string, human: boolean): TtsRole {
  if (spriteId !== null && FEMALE_CHARACTER_SPRITES.has(spriteId)) {
    return 'female';
  }
  if (human) {
    const n = name.trim().toLocaleLowerCase('ru-RU');
    if (n.length > 0 && /[ая]$/.test(n) && !MALE_A_YA_NAMES.has(n)) {
      return 'female';
    }
  }
  return 'male';
}
