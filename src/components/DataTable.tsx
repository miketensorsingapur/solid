import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuChevronsUpDown,
} from 'react-icons/lu';

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

export interface Column<T> {
  key: string;
  title: string;
  /** Значение для сортировки: числа сравниваются как числа, строки — как текст (с «натуральным» порядком 1.2 < 1.10). */
  value: (row: T) => string | number | null;
  /** Как показывать ячейку. По умолчанию — значение как есть. */
  render?: (row: T) => ReactNode;
  /** Числовая колонка: выравнивание вправо. */
  numeric?: boolean;
  /** Разрешить перенос длинного текста. По умолчанию значения не переносятся. */
  wrap?: boolean;
  minWidth?: number;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  rowClassName?: (row: T) => string | undefined;
  /** Высота области прокрутки; шапка остаётся на месте. */
  maxHeight?: number | string;
  pageSize?: number;
  footer?: ReactNode;
  label?: string;
  /** Первая колонка остаётся на месте при прокрутке вбок. */
  stickyFirst?: boolean;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const isEmpty = (v: string | number | null) => v === null || v === '';

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  maxHeight,
  pageSize = 100,
  footer,
  label,
  stickyFirst,
}: Props<T>) {
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [rows, sort]);

  // Если выбранная для сортировки колонка пропала (скрыли в «Колонки»), сортировка сбрасывается.
  const activeSort = sort && columns.some((c) => c.key === sort.key) ? sort : null;

  const sorted = useMemo(() => {
    if (!activeSort) return rows;
    const col = columns.find((c) => c.key === activeSort.key);
    if (!col) return rows;
    const sign = activeSort.dir === 'asc' ? 1 : -1;
    const keyed = rows.map((row, i) => ({ row, i, v: col.value(row) }));
    keyed.sort((x, y) => {
      const xe = isEmpty(x.v);
      const ye = isEmpty(y.v);
      // Пустые значения всегда внизу, при любом направлении.
      if (xe && ye) return x.i - y.i;
      if (xe) return 1;
      if (ye) return -1;
      const c = compareValues(x.v as string | number, y.v as string | number) * sign;
      return c !== 0 ? c : x.i - y.i;
    });
    return keyed.map((k) => k.row);
  }, [rows, columns, activeSort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = pageCount > 1 ? sorted.slice(current * pageSize, (current + 1) * pageSize) : sorted;

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  return (
    <div className="table-block">
      <div className="table-wrap" style={maxHeight != null ? { maxHeight } : undefined}>
        <table className={'data' + (stickyFirst ? ' sticky-first' : '')} aria-label={label}>
          <thead>
            <tr>
              {columns.map((c) => {
                const dir = activeSort?.key === c.key ? activeSort.dir : null;
                return (
                  <th
                    key={c.key}
                    className={c.numeric ? 'num' : undefined}
                    style={{ minWidth: c.minWidth ?? (c.wrap ? 170 : undefined) }}
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                  >
                    <button
                      type="button"
                      className={'th-btn' + (dir ? ' active' : '')}
                      onClick={() => toggleSort(c.key)}
                      title="Сортировать"
                    >
                      <span>{c.title}</span>
                      {dir === 'asc' ? (
                        <LuChevronUp aria-hidden />
                      ) : dir === 'desc' ? (
                        <LuChevronDown aria-hidden />
                      ) : (
                        <LuChevronsUpDown aria-hidden className="idle" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)} className={rowClassName?.(row)}>
                {columns.map((c) => {
                  const content = c.render ? c.render(row) : c.value(row);
                  return (
                    <td key={c.key} className={c.numeric ? 'num' : c.wrap ? 'wrap' : undefined}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  Нет данных
                </td>
              </tr>
            )}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>

      {pageCount > 1 && (
        <div className="pager">
          <span>
            Строки {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} из {sorted.length}
          </span>
          <div className="pager-btns">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <LuChevronLeft aria-hidden /> Назад
            </button>
            <span className="pager-page">
              {current + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Вперёд <LuChevronRight aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
