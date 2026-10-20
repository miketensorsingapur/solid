import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { LuColumns3 } from 'react-icons/lu';

interface Props {
  headers: string[];
  visible: boolean[];
  onChange: (next: boolean[]) => void;
}

/** Выпадающий список для скрытия и показа колонок таблицы. */
export function ColumnPicker({ headers, visible, onChange }: Props) {
  const shown = visible.filter(Boolean).length;

  const toggle = (i: number) => {
    const next = visible.slice();
    next[i] = !next[i];
    if (next.some(Boolean)) onChange(next); // хотя бы одна колонка должна остаться
  };

  return (
    <Popover className="popover">
      <PopoverButton className="btn btn-ghost btn-sm">
        <LuColumns3 aria-hidden />
        Колонки
        <span className="badge">
          {shown}/{headers.length}
        </span>
      </PopoverButton>
      <PopoverPanel anchor={{ to: 'bottom end', gap: 6, padding: 12 }} className="popover-panel">
        <div className="popover-actions">
          <button type="button" onClick={() => onChange(headers.map(() => true))}>
            Показать все
          </button>
        </div>
        {headers.map((h, i) => (
          <label key={i} className="check">
            <input type="checkbox" checked={visible[i]} onChange={() => toggle(i)} />
            <span>{h || `Колонка ${i + 1}`}</span>
          </label>
        ))}
      </PopoverPanel>
    </Popover>
  );
}
