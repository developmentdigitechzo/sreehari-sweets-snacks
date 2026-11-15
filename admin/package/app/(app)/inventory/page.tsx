'use client';
import { AlertTriangle, Boxes, PackageX, SlidersHorizontal, Download } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { Async, Badge, Field, Modal, PageHeader, Pagination, SearchInput, Spinner, StatCard, Tabs } from '@/components/ui/kit';
import { digitsOnly } from '@/lib/format';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type Row = { variantId: string; sku: string; product: string; size: string; category: string; published: boolean; stock: number; status: 'ok' | 'low' | 'out' };
type List = { items: Row[]; total: number; page: number; pages: number; pageSize: number; counts: { total: number; low: number; out: number; threshold: number } };

function Inventory() {
  const initial = useSearchParams().get('status');
  const [status, setStatus] = useState<'all' | 'low' | 'out'>(initial === 'low' || initial === 'out' ? initial : 'all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<List>(`admin/inventory${qs({ status, q, page, pageSize: 15 })}`);
  const [sel, setSel] = useState<Row | null>(null);
  const [mode, setMode] = useState<'add' | 'remove' | 'set'>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('RESTOCK');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setQ_ = useCallback((v: string) => { setQ(v); setPage(1); }, []);
  const c = data?.counts;

  const save = async () => {
    if (!sel || busy) return;
    if (!/^\d+$/.test(qty)) { setErr('Enter a whole number'); return; }
    setBusy(true);
    try {
      const r = await api<{ before: number; after: number }>(`admin/inventory/${sel.variantId}/adjust`, { method: 'POST', body: { mode, quantity: Number(qty), reason, note: note.trim() || undefined } });
      toast(`${sel.sku}: ${r.before} → ${r.after}`); setSel(null); reload();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const exportCsv = async () => {
    try {
      const csv = await api<string>(`admin/inventory${qs({ status, q, format: 'csv' })}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'inventory.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast((e as Error).message, 'bad'); }
  };

  const cols: Col<Row>[] = [
    { key: 'p', title: true, header: 'Product', cell: (r) => <div><p className="font-semibold">{r.product} <span className="font-normal text-ink-muted">({r.size})</span></p><p className="text-xs text-ink-muted">SKU: {r.sku}</p></div> },
    { key: 'c', header: 'Category', hideOnMobile: true, cell: (r) => r.category },
    { key: 's', header: 'Stock', cell: (r) => <b>{r.stock}</b> },
    { key: 't', header: 'Status', cell: (r) => (r.status === 'out' ? <Badge tone="bad" dot>Out of Stock</Badge> : r.status === 'low' ? <Badge tone="warn" dot>Low Stock</Badge> : <Badge tone="ok" dot>In Stock</Badge>) },
    { key: 'a', header: 'Actions', cell: (r) => <button className="btn-outline btn-sm" onClick={() => { setSel(r); setMode('add'); setQty(''); setReason('RESTOCK'); setNote(''); setErr(''); }}><SlidersHorizontal className="h-4 w-4" />Adjust</button> },
  ];

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock per size. Every change is recorded in Stock Movements, and orders can never take stock below zero." crumbs={['Inventory']}
        actions={<button className="btn-outline" onClick={exportCsv}><Download className="h-4 w-4" />Export</button>} />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 min-[480px]:grid-cols-3">
        <StatCard icon={<Boxes />} label="Tracked sizes" value={c?.total ?? '—'} />
        <StatCard icon={<AlertTriangle />} label={`Low stock (≤ ${c?.threshold ?? '…'})`} value={c?.low ?? '—'} tone="warn" />
        <StatCard icon={<PackageX />} label="Out of stock" value={c?.out ?? '—'} tone="bad" />
      </div>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ id: 'all', label: 'All', count: c?.total }, { id: 'low', label: 'Low stock', count: c?.low }, { id: 'out', label: 'Out of stock', count: c?.out }]} />
      <div className="card overflow-hidden">
        <div className="border-b border-line p-4"><SearchInput value={q} onChange={setQ_} placeholder="Search product or SKU…" /></div>
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No stock lines match">
          {data && <><DataTable rows={data.items} cols={cols} rowKey={(r) => r.variantId} caption="Stock levels" /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="sizes" /></>}
        </Async>
      </div>
      <Modal persistent locked={busy} open={!!sel} onClose={() => setSel(null)} title="Adjust stock" footer={<><button className="btn-outline" onClick={() => setSel(null)} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Save adjustment</button></>}>
        {sel && (
          <div className="space-y-4">
            <p className="text-sm"><b>{sel.product}</b> ({sel.size}) · {sel.sku}<br />Current stock: <b>{sel.stock}</b></p>
            <div role="radiogroup" aria-label="Adjustment type" className="grid grid-cols-3 gap-2">
              {([['add', 'Add'], ['remove', 'Remove'], ['set', 'Set to']] as const).map(([v, l]) => (
                <label key={v} className={`flex min-h-[42px] cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold ${mode === v ? 'border-burgundy bg-burgundy text-white' : 'border-line'}`}><input type="radio" className="sr-only" checked={mode === v} onChange={() => { setMode(v); setReason(v === 'add' ? 'RESTOCK' : 'ADJUSTMENT'); }} />{l}</label>
              ))}
            </div>
            <Field label={mode === 'set' ? 'New stock' : 'Quantity'} error={err}><input className="input" inputMode="numeric" value={qty} onChange={(e) => { setQty(digitsOnly(e.target.value)); setErr(''); }} /></Field>
            <Field label="Reason">
              <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                {mode === 'add' && <option value="RESTOCK">New stock received</option>}
                <option value="ADJUSTMENT">Manual adjustment</option><option value="CORRECTION">Stock count correction</option><option value="EXPIRY">Expired / damaged</option>
              </select>
            </Field>
            <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function InventoryPage() {
  return <Suspense><Inventory /></Suspense>;
}
