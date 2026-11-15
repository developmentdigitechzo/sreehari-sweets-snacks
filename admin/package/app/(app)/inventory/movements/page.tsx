'use client';
import { Download } from 'lucide-react';
import { useCallback, useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Async, Badge, PageHeader, Pagination, SearchInput, Select } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type M = { id: string; sku: string; delta: number; stockAfter: number; reason: string; actor: string; orderId: string | null; note: string | null; createdAt: string };
type List = { items: M[]; total: number; page: number; pages: number; pageSize: number };
const REASONS: Record<string, string> = { ORDER: 'Order placed', CANCEL: 'Order cancelled', RETURN: 'Return', ADJUSTMENT: 'Adjustment', RESTOCK: 'Restock', CORRECTION: 'Correction', EXPIRY: 'Expired / damaged' };

export default function Movements() {
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('all');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<List>(`admin/inventory/movements${qs({ q, reason, page, pageSize: 20 })}`);
  const setQ_ = useCallback((v: string) => { setQ(v); setPage(1); }, []);
  const cols: Col<M>[] = [
    { key: 'd', title: true, header: 'When', cell: (m) => dateTime(m.createdAt) },
    { key: 's', header: 'SKU', cell: (m) => <span className="font-medium">{m.sku}</span> },
    { key: 'c', header: 'Change', cell: (m) => <b className={m.delta > 0 ? 'text-ok' : 'text-bad'}>{m.delta > 0 ? `+${m.delta}` : m.delta}</b> },
    { key: 'a', header: 'Stock after', cell: (m) => m.stockAfter },
    { key: 'r', header: 'Reason', cell: (m) => <Badge tone="gray">{REASONS[m.reason] ?? m.reason}</Badge> },
    { key: 'b', header: 'By', hideOnMobile: true, cell: (m) => (m.actor.startsWith('admin:') ? 'Store staff' : m.actor.startsWith('customer:') ? 'Customer order' : m.actor) },
    { key: 'n', header: 'Note', hideOnMobile: true, cell: (m) => m.note ?? '' },
  ];
  const exportCsv = async () => {
    try {
      const csv = await api<string>(`admin/inventory/movements${qs({ q, reason, format: 'csv' })}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'stock-movements.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast((e as Error).message, 'bad'); }
  };
  return (
    <>
      <PageHeader title="Stock Movements" subtitle="Every stock change: orders, cancellations, restocks and adjustments. This history cannot be edited or deleted." crumbs={['Inventory', 'Movements']} actions={<button className="btn-outline" onClick={exportCsv}><Download className="h-4 w-4" />Export</button>} />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ_} placeholder="Search by SKU…" />
          <Select label="Reason" value={reason} onChange={(v) => { setReason(v); setPage(1); }} options={[{ value: 'all', label: 'All reasons' }, ...Object.entries(REASONS).map(([v, l]) => ({ value: v, label: l }))]} />
        </div>
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No movements yet">
          {data && <><DataTable rows={data.items} cols={cols} rowKey={(m) => m.id} caption="Stock movements" /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="movements" /></>}
        </Async>
      </div>
    </>
  );
}
