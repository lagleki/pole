import { describe, expect, it } from 'vitest';

import { defaultAssetSpec } from '../spec';
import { playerVoiceRole } from './script';

const spriteIds = defaultAssetSpec.spriteIds;

describe('playerVoiceRole (DIFF #21)', () => {
  it('uses female TTS for Сова, Фрекен Бок and Багира', () => {
    expect(playerVoiceRole(spriteIds.CHARACTER_OWL, 'СОВА', false)).toBe('female');
    expect(playerVoiceRole(spriteIds.CHARACTER_FREKEN, 'ФРЕКЕН БОК', false)).toBe('female');
    expect(playerVoiceRole(spriteIds.CHARACTER_BAGIRA, 'БАГИРА', false)).toBe('female');
  });

  it('uses male TTS for the other NPC sprites', () => {
    expect(playerVoiceRole(spriteIds.CHARACTER_CARLSEN, 'КАРЛСОН', false)).toBe('male');
    expect(playerVoiceRole(spriteIds.CHARACTER_VINNY, 'ВИННИ-ПУХ', false)).toBe('male');
  });

  it('treats human names ending in а/я as female, with a short male exception list', () => {
    expect(playerVoiceRole(spriteIds.PLAYER, 'МАША', true)).toBe('female');
    expect(playerVoiceRole(spriteIds.PLAYER, 'НАТАЛЬЯ', true)).toBe('female');
    expect(playerVoiceRole(spriteIds.PLAYER, 'ТЕСТ', true)).toBe('male');
    expect(playerVoiceRole(spriteIds.PLAYER, 'ИЛЬЯ', true)).toBe('male');
    expect(playerVoiceRole(spriteIds.PLAYER, 'НИКИТА', true)).toBe('male');
  });
});
