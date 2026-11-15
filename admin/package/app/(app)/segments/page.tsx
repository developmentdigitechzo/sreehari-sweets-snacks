'use client';
import { Crown, Pencil, Plus, ShoppingCart, Trash2, Users } from 'lucide-react';
import { seriesColors } from '@/lib/colors';
import Link from 'next/link';
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { api, useFetch } from '@/lib/api';
import { date, digitsOnly, num, rupee } from '@/lib/format';
import { Async, ConfirmDialog, Field, Modal, PageHeader, Spinner } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type Rule = { minSpend?: number; minOrders?: number; orderedWithinDays?: number; noOrderInDays?: number; joinedWithinDays?: number; usedCouponAtLeast?: number };
type Seg = { id: string; name: string; description: string; rule: Rule; isSystem: boolean; lastUsedAt: string | null; customers: number };
type Insights = { customers: number; avgOrderValue: number; purchaseFrequencyPerMonth: number; lastPurchase: string | null };
const FIELDS: { k: keyof Rule; label: string; hint: string }[] = [
  { k: 'minSpend', label: 'Total spend at least (₹)', hint: 'Lifetime, cancelled orders excluded' },
  { k: 'minOrders', label: 'Orders at least', hint: 'Number of orders' },
  { k: 'orderedWithinDays', label: 'Ordered within the last (days)', hint: 'Active buyers' },
  { k: 'noOrderInDays', label: 'No order in the last (days)', hint: 'Has ordered before, but not recently' },
  { k: 'joinedWithinDays', label: 'Joined within the last (days)', hint: 'New customers' },
  { k: 'usedCouponAtLeast', label: 'Used coupons at least (times)', hint: 'Offer seekers' },
];
const PALETTE = seriesColors;

export default function Segments() {
  const { data, error, loading, reload } = useFetch<{ items: Seg[]; totalCustomers: number }>('admin/segments');
  const [pick, setPick] = useState<string>('');
  const selected = data?.items.find((s) => s.id === pick) ?? data?.items[0];
  const ins = useFetch<Insights>(selected ? `admin/segments/${selected.id}/insights` : null);
  const [edit, setEdit] = useState<{ id?: string; name: string; description: string; rule: Record<string, string> } | null>(null);
  const [del, setDel] = useState<Seg | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [nameErr, setNameErr] = useState('');

  const save = async () => {
    if (!edit || busy) return;
    if (edit.name.trim().length < 2) { setNameErr('Enter a name (2+ characters)'); return; }
    const rule: Rule = {};
    for (const f of FIELDS) { const v = edit.rule[f.k]; if (v !== undefined && v !== '') { const n = Number(v); if (!(n >= 0)) { setErr(`${f.label}: enter a number`); return; } rule[f.k] = n; } }
    if (Object.keys(rule).length === 0) { setErr('Add at least one condition'); return; }
    setBusy(true);
    try { await api(edit.id ? `admin/segments/${edit.id}` : 'admin/segments', { method: edit.id ? 'PUT' : 'POST', body: { name: edit.name.trim(), description: edit.description.trim(), rule } }); toast('Segment saved'); setEdit(null); reload(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try { await api(`admin/segments/${del.id}`, { method: 'DELETE' }); toast('Segment deleted'); setDel(null); reload(); } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };
  const startEdit = (s?: Seg) => { setErr(''); setNameErr(''); setEdit(s ? { id: s.id, name: s.name, description: s.description, rule: Object.fromEntries(Object.entries(s.rule).map(([k, v]) => [k, String(v)])) } : { name: '', description: '', rule: {} }); };

  const cols: Col<Seg>[] = [
    { key: 'n', title: true, header: 'Segment name', cell: (s) => <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-gold" aria-hidden /><div><p className="font-semibold">{s.name}</p>{s.isSystem && <p className="text-xs text-ink-muted">Built in</p>}</div></div> },
    { key: 'c', header: 'Customers', cell: (s) => <b>{num(s.customers)}</b> },
    { key: 'd', header: 'Description', hideOnMobile: true, cell: (s) => s.description },
    { key: 'l', header: 'Last used', hideOnMobile: true, cell: (s) => (s.lastUsedAt ? date(s.lastUsedAt) : 'Never') },
    { key: 'a', header: 'Actions', cell: (s) => (
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" aria-label={`Edit ${s.name}`} onClick={() => startEdit(s)}><Pencil className="h-4 w-4" /></button>
        <Link href="/customers" className="icon-btn" aria-label={`Open customers (filter by ${s.name})`}><Users className="h-4 w-4" /></Link>
        {!s.isSystem && <button className="icon-btn icon-btn-bad" aria-label={`Delete ${s.name}`} onClick={() => setDel(s)}><Trash2 className="h-4 w-4" /></button>}
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Customer Segmentation" subtitle="Dynamic customer groups built from real orders, used to target notifications." crumbs={['Customer Segmentation']} actions={<button className="btn-primary" onClick={() => startEdit()}><Plus className="h-4 w-4" />Create Segment</button>} />
      <Async loading={loading} error={error} hasData={!!data} onRetry={reload}>
        {data && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
            <div className="card overflow-hidden"><DataTable rows={data.items} cols={cols} rowKey={(s) => s.id} caption="Segments" onRowClick={(s) => setPick(s.id)} /></div>
            <section className="card p-4 sm:p-5" aria-label="Segment insights">
              <div className="mb-3 flex items-center justify-between gap-2"><h2 className="section-title">Segment Insights</h2>
                <select className="input w-auto" value={selected?.id ?? ''} onChange={(e) => setPick(e.target.value)} aria-label="Segment">{data.items.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.customers})</option>)}</select></div>
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="relative h-40 w-40 shrink-0" role="img" aria-label="Share of customers by segment">
                  <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.items.filter((s) => s.customers > 0).slice(0, 6)} dataKey="customers" nameKey="name" innerRadius={46} outerRadius={72} stroke="none">{data.items.map((s, i) => <Cell key={s.id} fill={PALETTE[i % PALETTE.length]} />)}</Pie></PieChart></ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-bold">{num(selected?.customers ?? 0)}</span><span className="text-xs text-ink-muted">Customers</span></div>
                </div>
                <dl className="w-full space-y-2 rounded-xl bg-burgundy-soft/60 p-3 text-sm">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4 text-burgundy" aria-hidden /><dt className="flex-1">Customers</dt><dd className="font-semibold">{num(ins.data?.customers ?? selected?.customers ?? 0)}</dd></div>
                  <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-navy" aria-hidden /><dt className="flex-1">Avg. order value</dt><dd className="font-semibold">{ins.data ? rupee(ins.data.avgOrderValue) : '—'}</dd></div>
                  <div className="flex items-center gap-2"><dt className="flex-1 pl-6">Purchase frequency</dt><dd className="font-semibold">{ins.data ? `${ins.data.purchaseFrequencyPerMonth} / month` : '—'}</dd></div>
                  <div className="flex items-center gap-2"><dt className="flex-1 pl-6">Last purchase</dt><dd className="font-semibold">{ins.data?.lastPurchase ? date(ins.data.lastPurchase) : '—'}</dd></div>
                </dl>
              </div>
              <p className="mt-3 text-xs text-ink-muted">Counts include only customers who are not blocked. Segments can overlap.</p>
            </section>
          </div>
        )}
      </Async>
      <Modal persistent locked={busy} open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit segment' : 'Create segment'} footer={<><button className="btn-outline" onClick={() => setEdit(null)} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Save segment</button></>}>
        {edit && (
          <div className="space-y-4">
            {err && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-medium text-bad">{err}</p>}
            <Field label="Name" required error={nameErr}><input className="input" value={edit.name} onChange={(e) => { setEdit({ ...edit, name: e.target.value }); setNameErr(''); }} maxLength={60} /></Field>
            <Field label="Description"><input className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} maxLength={160} /></Field>
            <p className="text-sm font-semibold">Conditions <span className="font-normal text-ink-muted">(a customer must meet all the ones you fill in)</span></p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{FIELDS.map((f) => <Field key={f.k} label={f.label} hint={f.hint}><input className="input" inputMode="numeric" value={edit.rule[f.k] ?? ''} onChange={(e) => setEdit({ ...edit, rule: { ...edit.rule, [f.k]: digitsOnly(e.target.value) } })} /></Field>)}</div>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} danger busy={busy} onClose={() => setDel(null)} onConfirm={remove} title="Delete segment?" confirmLabel="Delete" message={<p><b>{del?.name}</b> will be removed. Past messages sent to it are not affected.</p>} />
    </>
  );
}
