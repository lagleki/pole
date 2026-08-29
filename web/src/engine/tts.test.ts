import { describe, expect, it } from 'vitest';

import {
  clipSpokenForRemote,
  createHostTts,
  googleTranslateTtsUrl,
  hostSpeechText,
  isRussianVoiceLang,
  pickRussianVoice,
  responsiveVoiceTtsUrl,
  spokenCasing,
  TTS_LANG,
} from './tts';

function voice(partial: Partial<SpeechSynthesisVoice> & Pick<SpeechSynthesisVoice, 'name' | 'lang'>): SpeechSynthesisVoice {
  return {
    default: false,
    localService: false,
    voiceURI: partial.name,
    ...partial,
  } as SpeechSynthesisVoice;
}

describe('spokenCasing', () => {
  it('recases ALL-CAPS oracle lines for the synthesiser', () => {
    expect(spokenCasing('ВРАЩАЙТЕ БАРАБАН!')).toBe('Вращайте барабан!');
    expect(spokenCasing('Тема:')).toBe('Тема:');
    expect(hostSpeechText('Тема:', 'НАПИТКИ')).toBe('Тема: Напитки');
    expect(hostSpeechText('Начинаем игру!', 'Загадано слово:')).toBe('Начинаем игру! Загадано слово:');
    expect(hostSpeechText('Представляю', 'участников!')).toBe('Представляю участников!');
    expect(hostSpeechText('Есть такая буква!', 'Браво!!')).toBe('Есть такая буква! Браво!!');
    expect(hostSpeechText('АНДРЕЙ', 'Вращайте барабан!')).toBe('Андрей, вращайте барабан!');
    expect(hostSpeechText('АНДРЕЙ', 'выиграл раунд!')).toBe('Андрей выиграл раунд!');
    expect(hostSpeechText('Назовите букву!')).toBe('Назовите букву!');
    expect(
      hostSpeechText('ЭТО по-латыни Prunus armeniaca, т.е. "армянский фрукт".', ''),
    ).toBe('ЭТО по-латыни Prunus armeniaca, т.е. "армянский фрукт".');
  });
});

describe('pickRussianVoice', () => {
  it('prefers a local male Russian voice', () => {
    const voices = [
      voice({ name: 'Google US English', lang: 'en-US', localService: true }),
      voice({ name: 'Milena', lang: 'ru-RU', localService: true }),
      voice({ name: 'Yuri', lang: 'ru-RU', localService: true }),
      voice({ name: 'Google русский', lang: 'ru-RU', localService: false }),
    ];
    expect(pickRussianVoice(voices)?.name).toBe('Yuri');
  });

  it('skips female voices so the remote male engine can take over', () => {
    expect(pickRussianVoice([voice({ name: 'Katya', lang: 'ru-RU' })])).toBeNull();
    expect(pickRussianVoice([voice({ name: 'Samantha', lang: 'en-US' })])).toBeNull();
    expect(pickRussianVoice([])).toBeNull();
    expect(isRussianVoiceLang('ru_RU')).toBe(true);
    expect(isRussianVoiceLang('ru-RU')).toBe(true);
    expect(isRussianVoiceLang('en-US')).toBe(false);
    expect(TTS_LANG).toBe('ru-RU');
    expect(pickRussianVoice([voice({ name: 'Yuri', lang: 'ru_RU', localService: true })])?.name).toBe('Yuri');
  });

  it('picks a named female Russian voice for players', () => {
    const voices = [
      voice({ name: 'Yuri', lang: 'ru-RU', localService: true }),
      voice({ name: 'Milena', lang: 'ru-RU', localService: true }),
    ];
    expect(pickRussianVoice(voices, 'female')?.name).toBe('Milena');
  });
});

describe('createHostTts without engines', () => {
  it('resolves started and ended immediately in node', async () => {
    const tts = createHostTts({ getEnabled: () => true });
    const line = tts.speak('Тема: Напитки');
    await line.started;
    await line.ended;
  });
});

describe('remote TTS urls', () => {
  it('encode Russian text for Google and ResponsiveVoice', () => {
    const google = googleTranslateTtsUrl('Тема: Напитки');
    expect(google).toContain('translate.google.com/translate_tts');
    expect(google).toContain('tl=ru');
    expect(google).toContain(encodeURIComponent('Тема: Напитки'));
    const withMarks = 'Андрей, вращайте барабан! Есть такая буква? Браво.';
    expect(googleTranslateTtsUrl(withMarks)).toContain(encodeURIComponent(withMarks));
    expect(responsiveVoiceTtsUrl(withMarks)).toContain(encodeURIComponent(withMarks));
    const long = `${'А'.repeat(80)}. ${'Б'.repeat(80)}! ${'В'.repeat(80)}?`;
    const clipped = clipSpokenForRemote(long, 120);
    expect(clipped.endsWith('.')).toBe(true);
    expect(clipped.length).toBeLessThanOrEqual(120);
    const rv = responsiveVoiceTtsUrl('Тема: Напитки');
    expect(rv).toContain('responsivevoice.org/getvoice.php');
    expect(rv).toContain('tl=ru');
    expect(rv).toContain('gender=male');
    expect(rv).toContain(encodeURIComponent('Russian Male'));
    const male = responsiveVoiceTtsUrl('Буква Б', 'male');
    expect(male).toContain('gender=male');
    expect(male).toContain('pitch=0.58');
    expect(male).not.toBe(rv);
    const female = responsiveVoiceTtsUrl('Буква А', 'female');
    expect(female).toContain('gender=female');
    expect(female).toContain(encodeURIComponent('Russian Female'));
  });
});
