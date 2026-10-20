import type { BomRow, ParsedFile } from './types';
import { isSbSection } from './parse';

export type SectionMode = 'assemblies' | 'sites';

export interface SectionGroup {
  key: string;
  title: string;
  /** Строка-заголовок группы (сборочная единица) — только в режиме «по сборкам». */
  head: BomRow | null;
  /** Строки группы в порядке файла, без строки-заголовка. */
  rows: BomRow[];
}

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

/**
 * Режим «по сборкам»: строка «СБ» открывает группу, ниже идут её детали
 * (вложенные строки с номерами вида 1.1, 1.2 …) — до следующей сборки.
 * Детали верхнего уровня без сборки собираются в отдельную группу.
 */
export function groupByAssembly(file: ParsedFile): SectionGroup[] {
  const groups: SectionGroup[] = [];
  const standalone: BomRow[] = [];

  for (const r of file.rows) {
    if (r.parent !== null) continue;
    if (r.children.length > 0 || isSbSection(r.section)) {
      groups.push({
        key: `asm-${r.id}`,
        title: `${r.number} ${r.name}`.trim(),
        head: r,
        rows: file.rows.filter((x) => x.rootId === r.id && x.id !== r.id),
      });
    } else {
      standalone.push(r);
    }
  }

  if (standalone.length > 0) {
    groups.push({
      key: 'standalone',
      title: 'Отдельные позиции (вне сборок)',
      head: null,
      rows: standalone,
    });
  }
  return groups;
}

/** Режим «по участкам»: все строки, сгруппированные по значению колонки «Участок». */
export function groupBySite(file: ParsedFile): SectionGroup[] {
  const map = new Map<string, BomRow[]>();
  for (const r of file.rows) {
    const key = r.site || '';
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return collator.compare(a, b);
    })
    .map(([site, rows]) => ({
      key: `site-${site}`,
      title: site || '(участок не указан)',
      head: null,
      rows,
    }));
}
