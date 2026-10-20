import { useMemo } from 'react';
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { LuChevronDown, LuInfo, LuTriangleAlert } from 'react-icons/lu';
import type { CalcResult, CalcRow } from '../lib/calc';
import { KIND_LABEL } from '../lib/calc';
import { fmt, fmtInt } from '../lib/format';
import { DataTable, type Column } from './DataTable';

const dash = <span className="muted">—</span>;

export function CalcView({ result }: { result: CalcResult }) {
  const { rows, totals, warnings } = result;

  const columns = useMemo<Column<CalcRow>[]>(
    () => [
      { key: 'material', title: 'Материал (Артикул)', minWidth: 200, wrap: true, value: (r) => r.material },
      { key: 'kind', title: 'Тип', value: (r) => KIND_LABEL[r.kind] },
      { key: 'size', title: 'Размеры', value: (r) => (r.size === '—' ? '' : r.size), render: (r) => (r.size === '—' ? dash : r.size) },
      { key: 'positions', title: 'Позиций', numeric: true, value: (r) => r.positions, render: (r) => fmtInt(r.positions) },
      { key: 'pieces', title: 'Всего, шт', numeric: true, value: (r) => r.pieces, render: (r) => fmtInt(r.pieces) },
      {
        key: 'length',
        title: 'Длина заготовок, м',
        numeric: true,
        value: (r) => r.lengthM,
        render: (r) => (r.lengthM == null ? dash : fmt(r.lengthM)),
      },
      { key: 'mass', title: 'Масса, кг', numeric: true, value: (r) => r.massKg, render: (r) => fmt(r.massKg) },
      {
        key: 'area',
        title: 'Площадь материала, м²',
        numeric: true,
        value: (r) => r.materialAreaM2,
        render: (r) => (r.materialAreaM2 === 0 ? dash : fmt(r.materialAreaM2)),
      },
      {
        key: 'paint',
        title: 'Площадь покраски, м²',
        numeric: true,
        value: (r) => r.paintAreaM2,
        render: (r) => (r.paintAreaM2 === 0 ? dash : fmt(r.paintAreaM2)),
      },
    ],
    [],
  );

  const totalPositions = rows.reduce((s, r) => s + r.positions, 0);

  const footer = (
    <tr className="row-total">
      <td colSpan={3}>Итого</td>
      <td className="num">{fmtInt(totalPositions)}</td>
      <td className="num">{fmtInt(totals.pieces)}</td>
      <td className="num">{fmt(totals.lengthM)}</td>
      <td className="num">{fmt(totals.massKg)}</td>
      <td className="num">{fmt(totals.materialAreaM2)}</td>
      <td className="num">{fmt(totals.paintAreaM2)}</td>
    </tr>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Расчёт по материалам</h2>
          <p className="muted">Одинаковые артикулы материала объединены. Сборочные единицы в расчёт не входят — считаются их детали.</p>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Общая масса" value={fmt(totals.massKg)} unit="кг" />
        <Stat label="Площадь материала" value={fmt(totals.materialAreaM2)} unit="м²" />
        <Stat label="Площадь покраски" value={fmt(totals.paintAreaM2)} unit="м²" accent />
        <Stat label="Длина заготовок" value={fmt(totals.lengthM)} unit="м" />
        <Stat label="Материалов" value={fmtInt(rows.length)} unit="артикулов" />
      </div>

      {warnings.map((w, i) => (
        <div key={i} className={'alert ' + (w.level === 'warning' ? 'alert-warn' : 'alert-info')} role="status">
          {w.level === 'warning' ? <LuTriangleAlert aria-hidden /> : <LuInfo aria-hidden />}
          <div>
            <div>{w.text}</div>
            {w.items && w.items.length > 0 && <div className="alert-items">{w.items.join(' · ')}</div>}
          </div>
        </div>
      ))}

      <DataTable
        label="Расчёт по материалам"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        footer={footer}
        maxHeight="60vh"
      />

      <Disclosure as="div" className="notes">
        <DisclosureButton className="notes-btn">
          <LuInfo aria-hidden />
          Как считается
          <LuChevronDown aria-hidden className="notes-chevron" />
        </DisclosureButton>
        <DisclosurePanel className="notes-body">
          <ul>
            <li>В расчёт входят только детали. Количество детали = её количество × количество сборок, в которые она входит.</li>
            <li>Артикулы материала объединяются без учёта регистра, пробелов и вида буквы «х» (латинская / русская).</li>
            <li>Масса берётся из колонки «Масса, г» (на одну штуку) и умножается на количество.</li>
            <li>
              Площадь материала. Труба: периметр сечения по размерам из названия × длина заготовки (наружная поверхность).
              Лист: площадь заготовки — «Площадь поверхности» / 2 (одна сторона). Прочее: «Площадь поверхности» из файла, если она есть.
            </li>
            <li>
              Площадь покраски — только для деталей в сборках с покрытием. Труба: наружная поверхность. Лист и прочее: вся
              «Площадь поверхности» детали.
            </li>
          </ul>
        </DisclosurePanel>
      </Disclosure>
    </section>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div className={'stat' + (accent ? ' stat-accent' : '')}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value} <span className="stat-unit">{unit}</span>
      </div>
    </div>
  );
}
