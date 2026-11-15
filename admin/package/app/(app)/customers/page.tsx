'use client';
import { Ban, Download, Eye, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { date, dateTime, num, rupee, signedInt } from '@/lib/format';
import { Async, Badge, ConfirmDialog, Field, PageHeader, Pagination, SearchInput, Select, SidePanel, StatCard, Tabs } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';
import { useRange } from '@/components/Shell';
import { PAY, STATUS } from '@/lib/status';

type Row = { id: string; name: string; phone: string; email: string | null; orders: number; totalSpend: number; isBlocked: boolean; marketingOptIn: boolean; isDemo: boolean; joinedAt: string };
type List = { items: Row[]; total: number; page: number; pages: number; pageSize: number; stats: { total: number; blocked: number; active: number; newCustomers: number; newDelta: number | null; marketingOptIn: number } };
type Detail = {
  id: string; name: string; phone: string; email: string | null; isBlocked: boolean; marketingOptIn: boolean; phoneVerified: boolean; isDemo: boolean; joinedAt: string;
  stats: { orders: number; totalSpend: number; avgOrder: number; rewardPoints: number };
  addresses: { id: string; label: string; line1: string; area: string; city: string; pincode: string; hasGps: boolean; isDefault: boolean }[];
  orders: { id: string; number: string; status: string; total: number; paymentStatus?: string; createdAt: string }[];
};
type Seg = { items: { id: string; name: string; customers: number }[] };

export default function Customers() {
  const days = useRange();
  const [status, setStatus] = useState<'all' | 'active' | 'blocked'>('all');
  const [q, setQ] = useState('');
  const [segmentId, setSeg] = useState('all');
  const [page, setPage] = useState(1);
  const list = useFetch<List>(`admin/customers${qs({ status, q, segmentId, page, pageSize: 10, days })}`);
  const segs = useFetch<Seg>('admin/segments');
  const [open, setOpen] = useState<string | null>(null);
  const setQ_ = useCallback((v: string) => { setQ(v); setPage(1); }, []);
  const s = list.data?.stats;

  const exportCsv = async () => {
    try {
      const csv = await api<string>(`admin/customers${qs({ status, q, segmentId, format: 'csv' })}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'customers.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast((e as Error).message, 'bad'); }
  };

  const cols: Col<Row>[] = [
    { key: 'n', title: true, header: 'Customer', cell: (r) => <div><p className="font-semibold">{r.name}{r.isDemo && <span className="ml-2 text-xs text-ink-muted">(demo)</span>}</p><p className="text-xs text-ink-muted">{r.phone}</p></div> },
    { key: 'e', header: 'Email', hideOnMobile: true, cell: (r) => r.email ?? '—' },
    { key: 'o', header: 'Orders', cell: (r) => r.orders },
    { key: 's', header: 'Total spend', cell: (r) => rupee(r.totalSpend) },
    { key: 'm', header: 'Marketing', hideOnMobile: true, cell: (r) => <Badge tone={r.marketingOptIn ? 'ok' : 'gray'}>{r.marketingOptIn ? 'Opted in' : 'No'}</Badge> },
    { key: 't', header: 'Status', cell: (r) => <Badge tone={r.isBlocked ? 'bad' : 'ok'} dot>{r.isBlocked ? 'Blocked' : 'Active'}</Badge> },
    { key: 'j', header: 'Joined', hideOnMobile: true, cell: (r) => date(r.joinedAt) },
    { key: 'a', header: 'View', cell: (r) => <button className="icon-btn" aria-label={`View ${r.name}`} onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}><Eye className="h-5 w-5" /></button> },
  ];

  return (
    <>
      <PageHeader title="Customers" subtitle="Profiles, saved addresses, order history and account status." crumbs={['Customers']} />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard icon={<Users />} label="Total Customers" value={s ? num(s.total) : '—'} />
        <StatCard icon={<UserPlus />} label={`New (last ${days} days)`} value={s ? num(s.newCustomers) : '—'} change={s?.newDelta} tone="gold" />
        <StatCard icon={<ShieldCheck />} label="Opted in to marketing" value={s ? num(s.marketingOptIn) : '—'} tone="ok" />
        <StatCard icon={<Ban />} label="Blocked" value={s ? num(s.blocked) : '—'} tone="bad" />
      </div>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ id: 'all', label: 'All', count: s?.total }, { id: 'active', label: 'Active', count: s?.active }, { id: 'blocked', label: 'Blocked', count: s?.blocked }]} />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ_} placeholder="Search name, mobile or email…" />
          <Select label="Segment" value={segmentId} onChange={(v) => { setSeg(v); setPage(1); }} options={[{ value: 'all', label: 'All segments' }, ...(segs.data?.items ?? []).map((x) => ({ value: x.id, label: `${x.name} (${x.customers})` }))]} />
          <button className="btn-outline" onClick={exportCsv}><Download className="h-4 w-4" />Export</button>
        </div>
        <Async loading={list.loading} error={list.error} hasData={!!list.data} onRetry={list.reload} empty={list.data?.total === 0} emptyTitle="No customers match">
          {list.data && <><DataTable rows={list.data.items} cols={cols} rowKey={(r) => r.id} caption="Customers" onRowClick={(r) => setOpen(r.id)} /><Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} noun="customers" /></>}
        </Async>
      </div>
      <CustomerPanel id={open} onClose={() => setOpen(null)} onChanged={list.reload} />
    </>
  );
}

function CustomerPanel({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useFetch<Detail>(id ? `admin/customers/${id}` : null);
  const [block, setBlock] = useState(false);
  const [reason, setReason] = useState('');
  const [pts, setPts] = useState({ points: '', note: '' });
  const [busy, setBusy] = useState(false);

  const setBlocked = async (isBlocked: boolean) => {
    if (isBlocked && reason.trim().length < 3) { toast('Give a reason for blocking', 'bad'); return; }
    setBusy(true);
    try { await api(`admin/customers/${id}`, { method: 'PATCH', body: { isBlocked, reason: reason.trim() || undefined } }); toast(isBlocked ? 'Customer blocked' : 'Customer unblocked'); setBlock(false); setReason(''); reload(); onChanged(); } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };
  const adjust = async () => {
    if (busy) return;
    const p = Number(pts.points);
    if (!Number.isInteger(p) || p === 0 || pts.note.trim().length < 3) { toast('Enter points (e.g. 50 or -20) and a note', 'bad'); return; }
    setBusy(true);
    try { await api(`admin/customers/${id}/points`, { method: 'POST', body: { points: p, note: pts.note.trim() } }); toast('Points updated'); setPts({ points: '', note: '' }); reload(); } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };

  return (
    <SidePanel open={!!id} onClose={onClose} title="Customer">
      <Async loading={loading} error={error} hasData={!!data} onRetry={reload}>
        {data && (
          <div className="space-y-5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-serif text-xl font-bold">{data.name}</p><p className="text-ink-muted">Joined {date(data.joinedAt)}</p></div>
              <Badge tone={data.isBlocked ? 'bad' : 'ok'} dot>{data.isBlocked ? 'Blocked' : 'Active'}</Badge>
            </div>
            <section><a className="text-burgundy underline" href={`tel:${data.phone}`}>{data.phone}</a>{data.phoneVerified ? ' · verified' : ' · not verified'}{data.email && <p className="text-ink-muted">{data.email}</p>}<p className="mt-1 text-ink-muted">Marketing messages: {data.marketingOptIn ? 'opted in' : 'not opted in'}</p></section>
            <section className="grid grid-cols-3 gap-2 text-center">
              {[['Orders', data.stats.orders], ['Spend', rupee(data.stats.totalSpend)], ['Avg order', rupee(data.stats.avgOrder)]].map(([l, v]) => <div key={String(l)} className="rounded-xl bg-cream p-2"><p className="text-xs text-ink-muted">{l}</p><p className="font-bold">{v}</p></div>)}
            </section>
            <section><h3 className="mb-1 font-semibold">Reward points: {data.stats.rewardPoints}</h3>
              <div className="flex flex-wrap gap-2"><input className="input w-24" inputMode="numeric" placeholder="+50" aria-label="Points to add or remove" value={pts.points} onChange={(e) => setPts({ ...pts, points: signedInt(e.target.value) })} /><input className="input min-w-[140px] flex-1" placeholder="Reason" aria-label="Reason" value={pts.note} onChange={(e) => setPts({ ...pts, note: e.target.value })} maxLength={120} /><button className="btn-outline" onClick={adjust} disabled={busy}>Apply</button></div></section>
            <section><h3 className="mb-1 font-semibold">Saved addresses ({data.addresses.length})</h3>
              {data.addresses.length === 0 ? <p className="text-ink-muted">None saved.</p> : <ul className="space-y-2">{data.addresses.map((a) => <li key={a.id} className="rounded-xl border border-line p-2"><b>{a.label}</b>{a.isDefault && ' · default'}<br />{a.line1}, {a.area}, {a.city} - {a.pincode}{a.hasGps && <span className="text-ink-muted"> · location pinned</span>}</li>)}</ul>}</section>
            <section><h3 className="mb-1 font-semibold">Recent orders</h3>
              {data.orders.length === 0 ? <p className="text-ink-muted">No orders yet.</p> : <ul className="divide-y divide-line rounded-xl border border-line">{data.orders.map((o) => <li key={o.id} className="flex items-center justify-between gap-2 p-2"><div><b className="text-burgundy">#{o.number}</b><p className="text-xs text-ink-muted">{dateTime(o.createdAt)}</p></div><div className="text-right"><p className="font-semibold">{rupee(o.total)}</p><Badge tone={STATUS[o.status]?.tone}>{STATUS[o.status]?.label}</Badge>{o.paymentStatus && <Badge tone={PAY[o.paymentStatus]?.tone}>{PAY[o.paymentStatus]?.label}</Badge>}</div></li>)}</ul>}</section>
            {data.isBlocked ? <button className="btn-outline w-full" disabled={busy} onClick={() => setBlocked(false)}>Unblock customer</button> : <button className="btn-outline w-full !border-bad/40 !text-bad" onClick={() => setBlock(true)}><Ban className="h-4 w-4" />Block customer</button>}
          </div>
        )}
      </Async>
      <ConfirmDialog open={block} danger busy={busy} onClose={() => setBlock(false)} onConfirm={() => setBlocked(true)} title="Block this customer?" confirmLabel="Block"
        message={<p>They will not be able to sign in or place orders. Existing orders are not changed.</p>}><Field label="Reason" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></Field></ConfirmDialog>
    </SidePanel>
  );
}
