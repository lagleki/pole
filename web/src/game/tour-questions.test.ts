import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { tourQuestionsFromJson, type TourQuestionsJson } from '../assets/ovl';

const pack = JSON.parse(
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets/tour-questions.json'), 'utf8'),
) as TourQuestionsJson;

describe('tour question pack (CHGK Jeopardy filter)', () => {
  it('is a v1 pack of unique А–Я answers long enough for an 8-stage run', () => {
    const questions = tourQuestionsFromJson(pack);
    expect(questions.length).toBeGreaterThanOrEqual(8);
    expect(pack.sourceUrl).toBe('http://db.chgk.info');
    const words = questions.map((q) => q.word);
    expect(new Set(words).size).toBe(words.length);
    for (const q of questions) {
      expect(q.word).toMatch(/^[А-Я]{4,12}$/);
      expect(q.theme.length).toBeGreaterThanOrEqual(50);
      expect(q.theme.length).toBeLessThanOrEqual(260);
    }
  });
});
