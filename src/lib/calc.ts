import type { BomRow, ParsedFile } from './types';

/** Плотность стали, г/см³. Нужна только для оценки площади листа по массе, если площади нет в файле. */
export const STEEL_DENSITY = 7.85;

export type MaterialKind = 'tube-rect' | 'tube-round' | 'sheet' | 'other';

export interface MaterialInfo {
  kind: MaterialKind;
  /** Размеры из названия: прямоугольная труба [ширина, высота, стенка], круглая [диаметр, стенка], лист [толщина]. */
  dims: number[];
}

export const KIND_LABEL: Record<MaterialKind, string> = {
  'tube-rect': 'Труба прямоугольная',
  'tube-round': 'Труба круглая',
  sheet: 'Лист',
  other: 'Прочее',
};

const NUM = '(\\d+(?:[.,]\\d+)?)';
// Разделитель размеров: латинская x, кириллическая х, ×, *
const SEP = '\\s*[xXхХ×*]\\s*';
const RE_THREE = new RegExp(`${NUM}${SEP}${NUM}${SEP}${NUM}`);
const RE_TWO = new RegExp(`${NUM}${SEP}${NUM}`);

const num = (s: string) => Number(s.replace(',', '.'));

/** Определяет тип материала и размеры по его названию, например «Труба 40x25x2» или «Лист 3 мм». */
export function parseMaterial(text: string): MaterialInfo {
  const t = text.trim();
  if (/труб/i.test(t)) {
    const three = RE_THREE.exec(t);
    if (three) {
      return { kind: 'tube-rect', dims: [num(three[1]), num(three[2]), num(three[3])] };
    }
    const two = RE_TWO.exec(t);
    if (two) {
      const d = num(two[1]);
      const wall = num(two[2]);
      if (wall > 0 && wall < d / 2) return { kind: 'tube-round', dims: [d, wall] };
    }
    return { kind: 'other', dims: [] };
  }
  if (/лист/i.test(t)) {
    const rest = t.replace(/^.*?лист/i, '');
    // Толщина: число перед «мм», иначе первое самостоятельное число (не часть марки вроде «ПВ-506»).
    const m =
      new RegExp(`${NUM}\\s*мм`, 'i').exec(rest) ??
      new RegExp(`(?<![\\p{L}\\d-])${NUM}`, 'u').exec(rest);
    if (m) return { kind: 'sheet', dims: [num(m[1])] };
  }
  return { kind: 'other', dims: [] };
}

/** Одинаковые артикулы: без учёта регистра, лишних пробелов и вида буквы «х» между цифрами. */
export function materialKey(material: string): string {
  return material
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s*[xх×*]\s*(?=\d)/g, '$1x');
}

export function sizeLabel(info: MaterialInfo): string {
  const f = (n: number) => String(n).replace('.', ',');
  switch (info.kind) {
    case 'tube-rect':
      return `${f(info.dims[0])}×${f(info.dims[1])}×${f(info.dims[2])} мм`;
    case 'tube-round':
      return `Ø${f(info.dims[0])}×${f(info.dims[1])} мм`;
    case 'sheet':
      return `толщина ${f(info.dims[0])} мм`;
    default:
      return '—';
  }
}

export interface CalcRow {
  key: string;
  material: string;
  kind: MaterialKind;
  size: string;
  /** Сколько строк спецификации объединено. */
  positions: number;
  /** Всего штук с учётом количества сборок. */
  pieces: number;
  /** Суммарная длина заготовок, м (если в файле есть длины). */
  lengthM: number | null;
  massKg: number;
  materialAreaM2: number;
  paintAreaM2: number;
}

export interface CalcWarning {
  level: 'warning' | 'info';
  text: string;
  /** Подробности: список позиций или материалов. */
  items?: string[];
}

export interface CalcResult {
  rows: CalcRow[];
  totals: {
    pieces: number;
    lengthM: number;
    massKg: number;
    materialAreaM2: number;
    paintAreaM2: number;
  };
  warnings: CalcWarning[];
}

const MM2_IN_M2 = 1e6;

interface Acc {
  key: string;
  material: string;
  info: MaterialInfo;
  positions: number;
  pieces: number;
  lengthMm: number;
  hasLength: boolean;
  massG: number;
  materialAreaMm2: number;
  paintAreaMm2: number;
}

const rowLabel = (r: BomRow) => `${r.number || '#' + (r.id + 1)} ${r.name}`.trim();

/**
 * Объединяет детали по артикулу материала и считает суммы.
 *
 * В расчёт попадают только детали (строки без вложенных строк и не «СБ»):
 * сборочные единицы — это контейнеры, их масса и площадь уже содержатся в деталях.
 * Количество каждой детали умножается на количество сборок, в которые она входит.
 *
 * Площадь материала:
 *   труба — наружная боковая поверхность: периметр сечения × длина заготовки;
 *   лист  — площадь заготовки (одна сторона) = «Площадь поверхности» / 2;
 *   прочее — «Площадь поверхности» из файла, если она указана.
 * Площадь покраски — только для деталей в сборках с покрытием:
 *   труба — наружная боковая поверхность; лист и прочее — вся «Площадь поверхности».
 */
export function calculate(file: ParsedFile): CalcResult {
  const groups = new Map<string, Acc>();
  const noLength: string[] = [];
  const sheetFromMass: string[] = [];
  const unknownSize = new Map<string, number>();

  for (const r of file.rows) {
    if (r.isAssembly) continue;

    const key = materialKey(r.material);
    let acc = groups.get(key);
    if (!acc) {
      acc = {
        key,
        material: r.material || '(материал не указан)',
        info: parseMaterial(r.material),
        positions: 0,
        pieces: 0,
        lengthMm: 0,
        hasLength: false,
        massG: 0,
        materialAreaMm2: 0,
        paintAreaMm2: 0,
      };
      groups.set(key, acc);
    }

    const qty = r.totalQty;
    const coated = r.effectiveCoating !== '';
    acc.positions += 1;
    acc.pieces += qty;
    acc.massG += (r.mass ?? 0) * qty;
    if (r.length != null) {
      acc.lengthMm += r.length * qty;
      acc.hasLength = true;
    }

    let area = 0; // площадь материала, мм², на всё количество
    let paint = 0; // площадь покраски, мм², на всё количество
    const { kind, dims } = acc.info;

    if (kind === 'tube-rect' || kind === 'tube-round') {
      if (r.length == null) {
        noLength.push(rowLabel(r));
      } else {
        const perimeter = kind === 'tube-rect' ? 2 * (dims[0] + dims[1]) : Math.PI * dims[0];
        area = perimeter * r.length * qty;
        paint = coated ? area : 0;
      }
    } else if (kind === 'sheet') {
      let surface = r.surface;
      if (surface == null && r.mass != null && dims[0] > 0) {
        // Оценка по массе: площадь одной стороны = объём / толщина, поверхность ≈ 2 стороны.
        surface = (2 * 1000 * r.mass) / (STEEL_DENSITY * dims[0]);
        sheetFromMass.push(rowLabel(r));
      }
      if (surface != null) {
        area = (surface / 2) * qty;
        paint = coated ? surface * qty : 0;
      }
    } else if (r.surface != null) {
      area = r.surface * qty;
      paint = coated ? area : 0;
    } else if (r.material) {
      unknownSize.set(r.material, (unknownSize.get(r.material) ?? 0) + 1);
    }

    acc.materialAreaMm2 += area;
    acc.paintAreaMm2 += paint;
  }

  const rows: CalcRow[] = [...groups.values()]
    .map((a) => ({
      key: a.key,
      material: a.material,
      kind: a.info.kind,
      size: sizeLabel(a.info),
      positions: a.positions,
      pieces: a.pieces,
      lengthM: a.hasLength ? a.lengthMm / 1000 : null,
      massKg: a.massG / 1000,
      materialAreaM2: a.materialAreaMm2 / MM2_IN_M2,
      paintAreaM2: a.paintAreaMm2 / MM2_IN_M2,
    }))
    .sort((x, y) => x.material.localeCompare(y.material, 'ru', { numeric: true }));

  const totals = rows.reduce(
    (t, r) => ({
      pieces: t.pieces + r.pieces,
      lengthM: t.lengthM + (r.lengthM ?? 0),
      massKg: t.massKg + r.massKg,
      materialAreaM2: t.materialAreaM2 + r.materialAreaM2,
      paintAreaM2: t.paintAreaM2 + r.paintAreaM2,
    }),
    { pieces: 0, lengthM: 0, massKg: 0, materialAreaM2: 0, paintAreaM2: 0 },
  );

  const warnings: CalcWarning[] = [];
  if (file.missing.length > 0) {
    warnings.push({
      level: 'warning',
      text: `В файле нет колонок: ${file.missing.join(', ')}. Расчёт может быть неполным.`,
    });
  }
  if (noLength.length > 0) {
    warnings.push({
      level: 'warning',
      text: 'У некоторых труб не указана длина заготовки — их площадь не посчитана.',
      items: noLength,
    });
  }
  if (sheetFromMass.length > 0) {
    warnings.push({
      level: 'info',
      text: `У листовых деталей нет площади поверхности — она оценена по массе (плотность ${STEEL_DENSITY} г/см³).`,
      items: sheetFromMass,
    });
  }
  if (unknownSize.size > 0) {
    warnings.push({
      level: 'info',
      text: 'Для этих материалов размеры в названии не распознаны, а площади в файле нет — площадь не считалась (масса учтена).',
      items: [...unknownSize.keys()],
    });
  }

  return { rows, totals, warnings };
}
