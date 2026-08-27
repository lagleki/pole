#!/usr/bin/env node
/**
 * Rebuilds web/public/assets/tour-questions.json from the public
 * Russian QA Jeopardy CSV (CHGK «Своя игра» questions).
 *
 * Usage:
 *   curl -L -o /tmp/jeopardy.csv \
 *     https://raw.githubusercontent.com/evrog/Russian-QA-Jeopardy/main/Russian_QA_Jeopardy_dataset_extended.csv
 *   node ./scripts/build-tour-questions.mjs /tmp/jeopardy.csv
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COUNT = 686;
const SEED = 1993;
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(webDir, 'public/assets/tour-questions.json');

function unquote(value) {
  if (!value) {
    return '';
  }
  let text = String(value).trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  }
  return text.replaceAll('""', '"').replace(/\s+/g, ' ').trim();
}

function normalizeWord(answer) {
  let word = unquote(answer).split(/[;/,(]/)[0].trim();
  word = word.replace(/^["«„]+|["»“]+$/g, '');
  return word.toUpperCase().replaceAll('Ё', 'Е');
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 134775813) + 1) >>> 0;
    return state / 2 ** 32;
  };
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node ./scripts/build-tour-questions.mjs <jeopardy.csv>');
  process.exit(1);
}

const raw = await readFile(csvPath, 'utf8');
const byWord = new Map();
for (const line of raw.split(/\r?\n/).slice(1)) {
  if (!line) {
    continue;
  }
  const cols = line.split('\t');
  const theme = unquote(cols[2] ?? '');
  const word = normalizeWord(cols[3] ?? '');
  if (!/^[А-Я]{4,12}$/.test(word)) {
    continue;
  }
  if (theme.length < 50 || theme.length > 260) {
    continue;
  }
  if (/раздат|изображен|\.jpg|\.png|https?:|www\./i.test(theme)) {
    continue;
  }
  const prev = byWord.get(word);
  if (!prev || theme.length > prev.theme.length) {
    byWord.set(word, {
      word,
      theme,
      author: unquote(cols[6] ?? ''),
      source: unquote(cols[8] ?? ''),
    });
  }
}

const items = [...byWord.values()];
const rnd = lcg(SEED);
for (let i = items.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rnd() * (i + 1));
  [items[i], items[j]] = [items[j], items[i]];
}
const picked = items.slice(0, COUNT).sort((a, b) => a.word.localeCompare(b.word, 'ru'));

const json = {
  format: 'pole-tour-questions',
  version: 1,
  comment:
    'Отфильтрованная выборка однословных ответов из датасета «Russian QA Jeopardy» (вопросы «Своей игры» / База вопросов ЧГК). Тексты вопросов не изменялись. Источник: http://db.chgk.info — некоммерческое использование, см. LICENSE-CHGK.txt.',
  sourceUrl: 'http://db.chgk.info',
  questions: picked,
};

await writeFile(outFile, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
console.log(`Wrote ${picked.length} questions to ${outFile}`);
