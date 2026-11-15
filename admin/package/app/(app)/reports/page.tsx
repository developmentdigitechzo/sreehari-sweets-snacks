'use client';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { Async, PageHeader, Pagination, Select, Tabs } from '@/components/ui/kit';
import { toast } from '@/components/ui/Toast';
import { useRange } from '@/components/Shell';

type Rep = { headers: string[]; items: (string | number | null)[][]; total: number; page: number; pages: number; pageSize: number };
const TYPES = [
  { id: 'sales', label: 'Sales' }, { id: 'products', label: 'Products' }, { id: 'categories', label: 'Categories' },
  { id: 'customers', label: 'Customers' }, { id: 'inventory', label: 'Inventory' }, { id: 'payments', label: 'Payments' },
] as const;

export default function Reports() {
  const days = useRange();
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('sales');
  const [group, setGroup] = useState('day');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<Rep>(`admin/reports${qs({ type, group, days, page, pageSize: 25 })}`);

  const download = async () => {
    try {
      const csv = await api<string>(`admin/reports${qs({ type, group, days, format: 'csv' })}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `${type}-report.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const numeric = (v: string | number | null) => typeof v === 'number';

  return (
    <>
      <PageHeader title="Reports & Analytics" subtitle={`Real figures from your orders, for the last ${days} days (change the range at the top).`} crumbs={['Reports & Analytics']} actions={<button className="btn-primary" onClick={download}><Download className="h-4 w-4" />Download CSV</button>} />
      <Tabs value={type} onChange={(v) => { setType(v); setPage(1); }} tabs={TYPES.map((t) => ({ id: t.id, label: t.label }))} />
      <div className="card overflow-hidden">
        {type === 'sales' && <div className="border-b border-line p-4"><Select label="Group by" value={group} onChange={(v) => { setGroup(v); setPage(1); }} options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} /></div>}
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No data for this period" emptyHint="Try a longer date range.">
          {data && (<>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full"><caption className="sr-only">{type} report</caption>
                <thead className="border-b border-line bg-cream/60"><tr>{data.headers.map((h) => <th key={h} scope="col" className="th">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">{data.items.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`td ${numeric(c) ? 'tabular-nums' : ''}`}>{c === null ? '—' : typeof c === 'number' ? new Intl.NumberFormat('en-IN').format(c) : c}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {data.items.map((r, i) => <li key={i} className="p-4"><p className="font-semibold">{String(r[0])}</p><dl className="mt-1 grid grid-cols-2 gap-2 text-sm">{r.slice(1).map((c, j) => <div key={j}><dt className="text-xs uppercase text-ink-faint">{data.headers[j + 1]}</dt><dd>{c === null ? '—' : typeof c === 'number' ? new Intl.NumberFormat('en-IN').format(c) : c}</dd></div>)}</dl></li>)}
            </ul>
            <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="rows" />
          </>)}
        </Async>
      </div>
    </>
  );
}
