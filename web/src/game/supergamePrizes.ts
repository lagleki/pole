/**
 * Procedural funny prize basket for the supergame (DIFF #31).
 * Target total ~10 000 ₽; items are session-only display strings.
 */

export interface SupergamePrize {
  name: string;
  rubles: number;
}

export interface PrizeRng {
  nextInt(maxExclusive: number): number;
}

/** Catalog of joke shop items with ruble prices. */
export const SUPERGAME_PRIZE_POOL: readonly SupergamePrize[] = [
  { name: 'Годовой запас влажных салфеток', rubles: 890 },
  { name: 'Чугунная сковорода 40 см', rubles: 2400 },
  { name: 'Набор резиновых уток для ванны', rubles: 650 },
  { name: 'Курс ораторского мастерства для кота', rubles: 3200 },
  { name: 'Электрическая зубная щётка для собаки', rubles: 1750 },
  { name: 'Плед с принтом «Я люблю понедельники»', rubles: 1100 },
  { name: 'Набор шнурков для калош (12 пар)', rubles: 480 },
  { name: 'Подставка для смартфона из мрамора', rubles: 2900 },
  { name: 'Микроволновка с голосом бабушки', rubles: 3500 },
  { name: 'Коврик «Добро пожаловать» для холодильника', rubles: 720 },
  { name: 'Набор берушей для соседей', rubles: 560 },
  { name: 'Сушилка для носков на 47 пар', rubles: 1340 },
  { name: 'Кружка «Лучший игрок Поля чудес»', rubles: 990 },
  { name: 'Гиря 1 кг с надписью «Лёгкая атлетика»', rubles: 2100 },
  { name: 'Пылесос для бороды', rubles: 2800 },
  { name: 'Набор магнитов на холодильник (пустой)', rubles: 430 },
  { name: 'Тапочки-тапиры размер 48', rubles: 1580 },
  { name: 'Будильник, который извиняется', rubles: 1920 },
  { name: 'Зонт обратного открывания (сломанный)', rubles: 670 },
  { name: 'Книга «Как выиграть в Поле чудес»', rubles: 1250 },
  { name: 'Набор для выращивания кактуса в офисе', rubles: 840 },
  { name: 'Подтяжки для носков премиум-класса', rubles: 510 },
  { name: 'Рулон мягкой бумаги (эконом)', rubles: 390 },
  { name: 'Открывашка для пива с подсветкой', rubles: 1180 },
  { name: 'Шапка-ушанка из синтетического меха', rubles: 1650 },
  { name: 'Гантели по 0,5 кг (для начинающих)', rubles: 980 },
  { name: 'Фен для сушки рыбы', rubles: 2200 },
  { name: 'Набор стикеров «Я был в студии»', rubles: 320 },
  { name: 'Тостер с рисунком барабана', rubles: 2450 },
  { name: 'Плед с карманом для пульта', rubles: 1420 },
  { name: 'Ковш для варенья (без варенья)', rubles: 760 },
  { name: 'Набор губок для мытья посуды', rubles: 540 },
  { name: 'Часы без стрелок (для философов)', rubles: 1890 },
  { name: 'Подушка с записью храпа ведущего', rubles: 2680 },
  { name: 'Скакалка для двоих', rubles: 620 },
  { name: 'Набор цветных скрепок (1000 шт.)', rubles: 450 },
  { name: 'Коврик для йоги с надписью «Дыши»', rubles: 1380 },
  { name: 'Лампа «Свет в конце тоннеля»', rubles: 3100 },
];

export const SUPERGAME_TARGET_RUBLES = 10_000;
export const SUPERGAME_MIN_TOTAL = 8_000;
export const SUPERGAME_MAX_TOTAL = 12_000;

/** Seven large super-prizes on the drum (DIFF #31). */
export const SUPER_DRUM_PRIZES: readonly string[] = [
  'АВТОМОБИЛЬ',
  'ПУТЕШЕСТВИЕ',
  'ХОЛОДИЛЬНИК',
  'КОМПЬЮТЕР',
  'МОТОЦИКЛ',
  'КВАРТИРА',
  'ЗОЛОТОЙ БАРАБАН',
];

function shuffleCopy<T>(items: readonly T[], rng: PrizeRng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build a funny prize basket totaling ~10 000 ₽.
 * Score nudges the target within the allowed band.
 */
export function buildPrizeBasket(score: number, rng: PrizeRng): SupergamePrize[] {
  const scoreFactor = Math.min(1.2, Math.max(0.85, 0.9 + score / 50_000));
  let target = Math.round(SUPERGAME_TARGET_RUBLES * scoreFactor);
  target = Math.max(SUPERGAME_MIN_TOTAL, Math.min(SUPERGAME_MAX_TOTAL, target));

  const pool = shuffleCopy(SUPERGAME_PRIZE_POOL, rng);
  const basket: SupergamePrize[] = [];
  let total = 0;

  for (const item of pool) {
    if (basket.length >= 9) {
      break;
    }
    if (total + item.rubles > SUPERGAME_MAX_TOTAL && basket.length >= 5) {
      continue;
    }
    if (total + item.rubles <= SUPERGAME_MAX_TOTAL) {
      basket.push(item);
      total += item.rubles;
    }
    if (total >= target && basket.length >= 6) {
      break;
    }
  }

  while (total < SUPERGAME_MIN_TOTAL && basket.length < pool.length) {
    const remaining = pool.filter((p) => !basket.includes(p));
    const next = remaining.find((p) => total + p.rubles <= SUPERGAME_MAX_TOTAL);
    if (!next) {
      break;
    }
    basket.push(next);
    total += next.rubles;
  }

  return basket;
}

export function basketTotal(basket: readonly SupergamePrize[]): number {
  return basket.reduce((sum, item) => sum + item.rubles, 0);
}

export function formatRubles(amount: number): string {
  return `${amount.toLocaleString('ru-RU')} ₽`;
}
