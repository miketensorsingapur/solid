/** Индексы смысловых колонок в файле (-1 — колонки нет). */
export interface ColMap {
  article: number;
  number: number;
  name: number;
  material: number;
  qty: number;
  mass: number;
  surface: number;
  coating: number;
  layer: number;
  site: number;
  section: number;
  length: number;
  desc: number;
}

export type ColKey = keyof ColMap;

/** Строка спецификации + производные поля. Числа приведены к г, мм, мм². */
export interface BomRow {
  id: number;
  /** Исходные значения ячеек в порядке колонок файла. */
  cells: string[];
  number: string;
  name: string;
  material: string;
  site: string;
  /** Раздел: «СБ» — сборочная единица, «Д» — деталь. */
  section: string;
  /** Покрытие, указанное в этой строке. */
  coating: string;
  desc: string;
  qty: number | null;
  /** Масса одной штуки, г. */
  mass: number | null;
  /** Площадь поверхности одной штуки, мм². */
  surface: number | null;
  /** Длина заготовки, мм. */
  length: number | null;
  parent: number | null;
  children: number[];
  /** Глубина вложенности, 1 — верхний уровень. */
  level: number;
  /** Количество с учётом всех родительских сборок. */
  totalQty: number;
  /** Своё покрытие или ближайшего родителя. */
  effectiveCoating: string;
  isAssembly: boolean;
  /** Номер верхнего уровня, к которому относится строка. */
  rootId: number;
}

export interface ParsedFile {
  fileName: string;
  encoding: string;
  delimiter: string;
  headers: string[];
  rows: BomRow[];
  cols: ColMap;
  /** Названия не найденных колонок, которые нужны для расчёта. */
  missing: string[];
  /** Колонки, значения которых сортируются как числа. */
  numericCols: boolean[];
}
