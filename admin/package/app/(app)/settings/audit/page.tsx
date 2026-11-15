'use client';
import { Download } from 'lucide-react';
import { useCallback, useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Async, Badge, PageHeader, Pagination, SearchInput, Select } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type A = { id: string; actorName: string; actorRole: string; action: string; entity: string; entityId: string | null; summary: string; createdAt: string };
type List = { items: A[]; total: number; page: number; pages: number; pageSize: number };
const ENTITIES = ['Product', 'Category', 'ProductVariant', 'Order', 'ReturnRequest', 'Customer', 'Coupon', 'Campaign', 'Banner', 'Broadcast', 'Segment', 'Setting', 'ServiceablePincode', 'MessageTemplate'];

export default function Audit() {
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('all');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<List>(`admin/audit${qs({ q, entity, page, pageSize: 25 })}`);
  const setQ_ = useCallback((v: string) => { setQ(v); setPage(1); }, []);
  const cols: Col<A>[] = [
    { key: 'w', title: true, header: 'When', cell: (a) => dateTime(a.createdAt) },
    { key: 'u', header: 'Who', cell: (a) => <div><p className="font-medium">{a.actorName}</p><p className="text-xs text-ink-muted">{a.actorRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Manager'}</p></div> },
    { key: 's', header: 'What happened', cell: (a) => a.summary },
    { key: 'e', header: 'Area', hideOnMobile: true, cell: (a) => <Badge tone="gray">{a.entity}</Badge> },
    { key: 'a', header: 'Action', hideOnMobile: true, cell: (a) => <span className="text-xs text-ink-muted">{a.action}</span> },
  ];
  const exportCsv = async () => {
    try {
      const csv = await api<string>(`admin/audit${qs({ q, entity, format: 'csv' })}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'audit-log.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast((e as Error).message, 'bad'); }
  };
  return (
    <>
      <PageHeader title="Audit Log" subtitle="A permanent record of who changed what. It cannot be edited or deleted, and never stores passwords or keys." crumbs={['Settings', 'Audit Log']} actions={<button className="btn-outline" onClick={exportCsv}><Download className="h-4 w-4" />Export</button>} />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ_} placeholder="Search what happened…" />
          <Select label="Area" value={entity} onChange={(v) => { setEntity(v); setPage(1); }} options={[{ value: 'all', label: 'All areas' }, ...ENTITIES.map((e) => ({ value: e, label: e }))]} />
        </div>
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No activity recorded yet">
          {data && <><DataTable rows={data.items} cols={cols} rowKey={(a) => a.id} caption="Audit log" /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="entries" /></>}
        </Async>
      </div>
    </>
  );
}
