import type { BomRow, ColKey, ColMap, ParsedFile } from './types';

/* ---------- Чтение файла ---------- */

/** Определяет кодировку и превращает байты в строку. */
export function decodeBuffer(buf: ArrayBuffer): { text: string; encoding: string } {
  const u8 = new Uint8Array(buf);
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(u8), encoding: 'UTF-16 LE' };
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(u8), encoding: 'UTF-16 BE' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1251').decode(u8), encoding: 'Windows-1251' };
  }
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  if (count('\t') > 0) return '\t';
  if (count(';') > 0) return ';';
  return ',';
}

/** Разбор текста с разделителями. Поддерживает кавычки и переносы строк внутри ячеек. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"' && cell === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/* ---------- Числа и единицы ---------- */

export function toNum(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Множитель для перевода значения из единиц заголовка колонки в базовые (г, мм, мм²). */
function unitFactor(header: string, kind: 'mass' | 'area' | 'length'): number {
  const h = header.toLowerCase();
  if (kind === 'mass') {
    if (/кг|\bkg\b/.test(h)) return 1000;
    return 1;
  }
  if (kind === 'area') {
    if (/мм\s*[2²]/.test(h)) return 1;
    if (/см\s*[2²]/.test(h)) return 100;
    if (/(^|[^а-яa-z])м\s*[2²]/.test(h)) return 1e6;
    return 1;
  }
  if (/мм/.test(h)) return 1;
  if (/см/.test(h)) return 10;
  if (/(^|[\s,(])м($|[\s)])/.test(h)) return 1000;
  return 1;
}

/* ---------- Колонки ---------- */

const COLUMN_PATTERNS: Record<ColKey, RegExp> = {
  article: /^артикул$/,
  number: /^(№|n|номер|поз\.?|позиция)$/,
  name: /^наименование/,
  material: /^материал/,
  qty: /^(кол-?во|количество)/,
  mass: /^масса/,
  surface: /^площадь/,
  coating: /^покрытие/,
  layer: /^слой/,
  site: /^участок/,
  section: /^раздел/,
  length: /^длина/,
  desc: /^описание/,
};

function mapColumns(headers: string[]): ColMap {
  const norm = headers.map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
  const map = {} as ColMap;
  (Object.keys(COLUMN_PATTERNS) as ColKey[]).forEach((key) => {
    map[key] = norm.findIndex((h) => COLUMN_PATTERNS[key].test(h));
  });
  return map;
}

/** «СБ» — сборочная единица (допускаем латиницу вместо кириллицы). */
export function isSbSection(section: string): boolean {
  return /^[сc][бb]$/i.test(section.trim());
}

/* ---------- Разбор спецификации ---------- */

export function parseBom(text: string, fileName: string, encoding: string): ParsedFile {
  const delimiter = detectDelimiter(text);
  const table = parseDelimited(text, delimiter).filter((r) => r.some((c) => c.trim() !== ''));
  if (table.length === 0) throw new Error('Файл пустой.');

  // Первая строка — названия колонок.
  const headers = table[0].map((h) => h.replace(/^﻿/, '').trim());
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
  if (headers.length < 2) {
    throw new Error('Не удалось разобрать заголовок: в первой строке меньше двух колонок.');
  }
  if (table.length < 2) throw new Error('В файле есть заголовок, но нет ни одной строки данных.');

  const cols = mapColumns(headers);
  const massK = cols.mass >= 0 ? unitFactor(headers[cols.mass], 'mass') : 1;
  const areaK = cols.surface >= 0 ? unitFactor(headers[cols.surface], 'area') : 1;
  const lenK = cols.length >= 0 ? unitFactor(headers[cols.length], 'length') : 1;

  const cell = (cells: string[], idx: number) => (idx >= 0 ? (cells[idx] ?? '') : '');
  const scaled = (v: number | null, k: number) => (v == null ? null : v * k);

  const rows: BomRow[] = table.slice(1).map((raw, id) => {
    const cells = headers.map((_, i) => (raw[i] ?? '').trim());
    return {
      id,
      cells,
      number: cell(cells, cols.number).replace(/\.+$/, ''),
      name: cell(cells, cols.name),
      material: cell(cells, cols.material),
      site: cell(cells, cols.site),
      section: cell(cells, cols.section),
      coating: cell(cells, cols.coating),
      desc: cell(cells, cols.desc),
      qty: toNum(cell(cells, cols.qty)),
      mass: scaled(toNum(cell(cells, cols.mass)), massK),
      surface: scaled(toNum(cell(cells, cols.surface)), areaK),
      length: scaled(toNum(cell(cells, cols.length)), lenK),
      parent: null,
      children: [],
      level: 1,
      totalQty: 1,
      effectiveCoating: '',
      isAssembly: false,
      rootId: id,
    };
  });

  buildHierarchy(rows);

  const missing: string[] = [];
  const need: [ColKey, string][] = [
    ['material', 'Материал (Артикул)'],
    ['qty', 'Количество'],
    ['mass', 'Масса'],
  ];
  need.forEach(([key, title]) => {
    if (cols[key] < 0) missing.push(title);
  });

  const numericCols = headers.map((_, i) => {
    if (i === cols.number || i === cols.article) return false;
    const values = rows.map((r) => r.cells[i]).filter((v) => v !== '');
    return values.length > 0 && values.every((v) => toNum(v) !== null);
  });

  return { fileName, encoding, delimiter, headers, rows, cols, missing, numericCols };
}

/**
 * Определяет вложенность строк.
 * Основной способ — по номеру позиции: «1.2» входит в «1».
 * Если номеров нет, строка «СБ» открывает группу, и все следующие детали входят в неё.
 */
function buildHierarchy(rows: BomRow[]): void {
  const hasNumbers = rows.some((r) => r.number !== '');

  if (hasNumbers) {
    const byNumber = new Map<string, number>();
    rows.forEach((r) => {
      if (r.number && !byNumber.has(r.number)) byNumber.set(r.number, r.id);
    });
    rows.forEach((r) => {
      const dot = r.number.lastIndexOf('.');
      if (dot > 0) r.parent = byNumber.get(r.number.slice(0, dot)) ?? null;
    });
  } else {
    let current: number | null = null;
    rows.forEach((r) => {
      if (isSbSection(r.section)) {
        current = r.id;
      } else {
        r.parent = current;
      }
    });
  }

  rows.forEach((r) => {
    if (r.parent != null && r.parent !== r.id) rows[r.parent].children.push(r.id);
    else r.parent = null;
  });

  // level, totalQty, effectiveCoating, rootId — через родителей (с защитой от циклов).
  const done = new Set<number>();
  const resolve = (r: BomRow, trail: Set<number>): void => {
    if (done.has(r.id)) return;
    if (trail.has(r.id)) {
      r.parent = null;
    }
    const parent = r.parent != null ? rows[r.parent] : null;
    if (parent) {
      trail.add(r.id);
      resolve(parent, trail);
      trail.delete(r.id);
    }
    r.level = parent ? parent.level + 1 : 1;
    r.totalQty = (r.qty ?? 1) * (parent ? parent.totalQty : 1);
    r.effectiveCoating = r.coating || (parent ? parent.effectiveCoating : '');
    r.rootId = parent ? parent.rootId : r.id;
    done.add(r.id);
  };
  rows.forEach((r) => resolve(r, new Set()));

  rows.forEach((r) => {
    r.isAssembly = r.children.length > 0 || isSbSection(r.section);
  });
}
