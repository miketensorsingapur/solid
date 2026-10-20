import { useMemo, useState } from 'react';
import { Radio, RadioGroup } from '@headlessui/react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';
import type { BomRow, ParsedFile } from '../lib/types';
import { groupByAssembly, groupBySite, type SectionGroup, type SectionMode } from '../lib/sections';
import { fmtInt } from '../lib/format';
import { DataTable, type Column } from './DataTable';

const MODES: { value: SectionMode; label: string; hint: string }[] = [
  { value: 'assemblies', label: 'По сборкам', hint: 'Строка «СБ» и ниже её детали — до следующей сборки' },
  { value: 'sites', label: 'По участкам', hint: 'Все строки, сгруппированные по значению колонки «Участок»' },
];

export function SectionsView({ file }: { file: ParsedFile }) {
  const [mode, setMode] = useState<SectionMode>('assemblies');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => (mode === 'assemblies' ? groupByAssembly(file) : groupBySite(file)), [file, mode]);

  const columns = useMemo<Column<BomRow>[]>(() => {
    const h = (idx: number, fallback: string) => (idx >= 0 ? file.headers[idx] : fallback);
    const cols: Column<BomRow>[] = [];
    const rowById = (id: number | null) => (id == null ? null : file.rows[id]);

    if (file.cols.number >= 0) {
      cols.push({ key: 'number', title: h(file.cols.number, '№'), value: (r) => r.number });
    }
    cols.push({
      key: 'name',
      title: h(file.cols.name, 'Наименование'),
      minWidth: 220,
      wrap: true,
      value: (r) => r.name,
      render: (r) => <span style={{ paddingLeft: mode === 'assemblies' ? Math.max(0, r.level - 2) * 14 : 0 }}>{r.name}</span>,
    });
    if (mode === 'sites') {
      cols.push({
        key: 'parent',
        title: 'Входит в',
        value: (r) => {
          const p = rowById(r.parent);
          return p ? `${p.number} ${p.name}`.trim() : '';
        },
      });
    }
    if (file.cols.material >= 0) cols.push({ key: 'material', title: h(file.cols.material, 'Материал'), wrap: true, value: (r) => r.material });
    if (file.cols.qty >= 0) {
      cols.push({ key: 'qty', title: h(file.cols.qty, 'Количество'), numeric: true, value: (r) => r.qty, render: (r) => r.cells[file.cols.qty] });
    }
    cols.push({
      key: 'total',
      title: 'Всего, шт',
      numeric: true,
      value: (r) => r.totalQty,
      render: (r) => fmtInt(r.totalQty),
    });
    if (file.cols.mass >= 0) {
      cols.push({ key: 'mass', title: h(file.cols.mass, 'Масса'), numeric: true, value: (r) => r.mass, render: (r) => r.cells[file.cols.mass] });
    }
    if (file.cols.length >= 0) {
      cols.push({ key: 'length', title: h(file.cols.length, 'Длина'), numeric: true, value: (r) => r.length, render: (r) => r.cells[file.cols.length] });
    }
    if (file.cols.section >= 0) cols.push({ key: 'section', title: h(file.cols.section, 'Раздел'), value: (r) => r.section });
    if (mode === 'assemblies' && file.cols.site >= 0) cols.push({ key: 'site', title: h(file.cols.site, 'Участок'), value: (r) => r.site });
    if (file.cols.desc >= 0) cols.push({ key: 'desc', title: h(file.cols.desc, 'Описание'), wrap: true, value: (r) => r.desc });
    return cols;
  }, [file, mode]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Участки</h2>
          <p className="muted">{MODES.find((m) => m.value === mode)?.hint}.</p>
        </div>
        <div className="panel-tools">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}
          >
            {allCollapsed ? 'Развернуть все' : 'Свернуть все'}
          </button>
          <RadioGroup value={mode} onChange={setMode} className="seg" aria-label="Способ группировки">
            {MODES.map((m) => (
              <Radio key={m.value} value={m.value} className="seg-item">
                {m.label}
              </Radio>
            ))}
          </RadioGroup>
        </div>
      </div>

      {groups.length === 0 && <p className="muted">Нет данных для показа.</p>}

      {groups.map((g) => (
        <GroupCard
          key={g.key}
          group={g}
          mode={mode}
          open={!collapsed.has(g.key)}
          onToggle={() => toggle(g.key)}
          columns={columns}
        />
      ))}
    </section>
  );
}

function GroupCard({
  group,
  mode,
  open,
  onToggle,
  columns,
}: {
  group: SectionGroup;
  mode: SectionMode;
  open: boolean;
  onToggle: () => void;
  columns: Column<BomRow>[];
}) {
  const { head } = group;
  return (
    <div className="group">
      <button type="button" className="group-head" onClick={onToggle} aria-expanded={open}>
        {open ? <LuChevronDown aria-hidden /> : <LuChevronRight aria-hidden />}
        <span className="group-title">{group.title}</span>
        <span className="chips">
          {head && head.site && <span className="chip chip-primary">{head.site}</span>}
          {head && head.section && <span className="chip">{head.section}</span>}
          {head && head.qty != null && <span className="chip">× {fmtInt(head.qty)} шт.</span>}
          {head && head.coating && <span className="chip">{head.coating}</span>}
          {head && head.desc && <span className="chip chip-soft">{head.desc}</span>}
          <span className="chip chip-soft">{mode === 'assemblies' ? 'деталей' : 'строк'}: {group.rows.length}</span>
        </span>
      </button>
      {open && (
        <div className="group-body">
          <DataTable
            label={group.title}
            columns={columns}
            rows={group.rows}
            rowKey={(r) => r.id}
            rowClassName={(r) => (r.isAssembly ? 'row-assembly' : undefined)}
            pageSize={500}
          />
        </div>
      )}
    </div>
  );
}
