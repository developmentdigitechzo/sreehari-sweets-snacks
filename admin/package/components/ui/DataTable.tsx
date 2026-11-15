'use client';
import type { KeyboardEvent, ReactNode } from 'react';

export type Col<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Shown as the card title on phones (first column by default). */
  title?: boolean;
  /** Hide on phones. */
  hideOnMobile?: boolean;
  className?: string;
};

/**
 * One data definition, two layouts: a table from `md` up, and stacked cards on phones (no sideways scrolling).
 */
export function DataTable<T>({ rows, cols, rowKey, onRowClick, selectable, selected, onSelect, caption }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void;
  selectable?: boolean; selected?: Set<string>; onSelect?: (s: Set<string>) => void; caption: string;
}) {
  const titleCol = cols.find((c) => c.title) ?? cols[0];
  const rest = cols.filter((c) => c !== titleCol && !c.hideOnMobile);
  const allOn = selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));
  /** Clickable rows are reachable and operable from the keyboard, not only by mouse. */
  const rowProps = (r: T) => onRowClick ? {
    tabIndex: 0,
    onClick: () => onRowClick(r),
    onKeyDown: (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(r); } },
  } : {};
  const toggle = (k: string) => {
    const s = new Set(selected);
    if (s.has(k)) s.delete(k); else s.add(k);
    onSelect?.(s);
  };
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-line bg-cream/60">
            <tr>
              {selectable && <th className="th w-10"><input type="checkbox" aria-label="Select all" checked={!!allOn} onChange={() => onSelect?.(allOn ? new Set() : new Set(rows.map(rowKey)))} /></th>}
              {cols.map((c) => <th key={c.key} className={`th ${c.className ?? ''}`} scope="col">{c.header}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={rowKey(r)} className={onRowClick ? 'cursor-pointer hover:bg-cream/50' : ''} {...rowProps(r)}>
                {selectable && <td className="td w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select row" checked={!!selected?.has(rowKey(r))} onChange={() => toggle(rowKey(r))} /></td>}
                {cols.map((c) => <td key={c.key} className={`td ${c.className ?? ''}`}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className={`space-y-2 p-4 ${onRowClick ? 'cursor-pointer active:bg-cream/60' : ''}`} {...rowProps(r)}>
            <div className="flex items-start justify-between gap-3">
              {selectable && <input type="checkbox" className="mt-1" aria-label="Select row" checked={!!selected?.has(rowKey(r))} onClick={(e) => e.stopPropagation()} onChange={() => toggle(rowKey(r))} />}
              <div className="min-w-0 flex-1 font-semibold text-ink">{titleCol.cell(r)}</div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-xs uppercase tracking-wide text-ink-faint">{c.header}</dt>
                  <dd className="min-w-0 text-ink">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
