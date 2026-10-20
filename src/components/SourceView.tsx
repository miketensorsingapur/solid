import { useMemo, useState } from 'react';
import type { BomRow, ParsedFile } from '../lib/types';
import { toNum } from '../lib/parse';
import { DataTable, type Column } from './DataTable';
import { ColumnPicker } from './ColumnPicker';

/** Исходная таблица: все колонки из первой строки файла, сортировка по любой. */
export function SourceView({ file }: { file: ParsedFile }) {
  const [visible, setVisible] = useState<boolean[]>(() => file.headers.map(() => true));

  const columns = useMemo<Column<BomRow>[]>(() => {
    const result: Column<BomRow>[] = [];
    file.headers.forEach((header, i) => {
      if (!visible[i]) return;
      const numeric = file.numericCols[i];
      const isName = i === file.cols.name;
      result.push({
        key: `c${i}`,
        title: header || `Колонка ${i + 1}`,
        numeric,
        wrap: isName || i === file.cols.material || i === file.cols.desc,
        minWidth: isName ? 220 : undefined,
        value: (r) => (numeric ? toNum(r.cells[i]) : r.cells[i]),
        render: isName
          ? (r) => <span style={{ paddingLeft: (r.level - 1) * 14 }}>{r.cells[i]}</span>
          : (r) => r.cells[i],
      });
    });
    return result;
  }, [file, visible]);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Исходная таблица</h2>
          <p className="muted">Строк: {file.rows.length}. Нажмите на заголовок колонки, чтобы отсортировать.</p>
        </div>
        <ColumnPicker headers={file.headers} visible={visible} onChange={setVisible} />
      </div>
      <DataTable
        label="Исходная таблица"
        columns={columns}
        rows={file.rows}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.isAssembly ? 'row-assembly' : undefined)}
        maxHeight="68vh"
      />
    </section>
  );
}
