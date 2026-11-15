'use client';
import { useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { dateTime, decimalOnly, rupee } from '@/lib/format';
import { Async, Badge, Field, Modal, PageHeader, Pagination, SearchInput, Spinner, Tabs } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';
import { useMe, can } from '@/components/Shell';
import { RETURN_STATUS } from '@/lib/status';

type R = {
  id: string; kind: 'RETURN' | 'CANCELLATION'; status: string; reason: string; details: string | null; refundAmount: number | null; refundMode: string | null; refundReference: string | null; adminNote: string | null; createdAt: string;
  order: { id: string; number: string; total: number; status: string }; customer: { id: string; name: string; phone: string };
  payment: { method: string; status: string; amount: number; provider: string; simulated: boolean } | null;
};
type List = { items: R[]; total: number; page: number; pages: number; pageSize: number; counts: Record<string, number> };

export default function Returns() {
  const me = useMe();
  const [status, setStatus] = useState('REQUESTED');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<List>(`admin/returns${qs({ status, q, page, pageSize: 10 })}`);
  const [sel, setSel] = useState<R | null>(null);
  const [mode, setMode] = useState<'approve' | 'reject' | 'refund' | null>(null);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [restock, setRestock] = useState(false);
  const [refundMode, setRefundMode] = useState<'manual' | 'provider'>('manual');
  const [busy, setBusy] = useState(false);
  const c = data?.counts ?? {};

  const run = async () => {
    if (!sel || !mode || busy) return;
    setBusy(true);
    try {
      if (mode === 'refund') {
        if (refundMode === 'manual' && !reference.trim()) { toast('Enter where the money was returned (receipt, UPI or bank reference)', 'bad'); setBusy(false); return; }
        await api(`admin/returns/${sel.id}/refund`, { method: 'POST', body: { mode: refundMode, reference: reference.trim() || undefined, amount: amount ? Number(amount) : undefined } });
        toast('Refund recorded');
      } else {
        if (mode === 'reject' && !note.trim()) { toast('Explain why it is rejected', 'bad'); setBusy(false); return; }
        await api(`admin/returns/${sel.id}/decision`, { method: 'POST', body: { decision: mode, note: note.trim() || undefined, refundAmount: amount ? Number(amount) : undefined, restock } });
        toast(mode === 'approve' ? 'Request approved' : 'Request rejected');
      }
      setMode(null); setSel(null); setNote(''); setAmount(''); setReference(''); reload();
    } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };
  const open = (r: R, m: 'approve' | 'reject' | 'refund') => { setSel(r); setMode(m); setAmount(m === 'refund' ? String(r.refundAmount ?? r.order.total) : ''); setNote(''); setReference(''); setRefundMode('manual'); setRestock(false); };

  const cols: Col<R>[] = [
    { key: 'o', title: true, header: 'Order', cell: (r) => <span className="font-bold text-burgundy">#{r.order.number}</span> },
    { key: 'k', header: 'Type', cell: (r) => <Badge tone={r.kind === 'RETURN' ? 'violet' : 'gray'}>{r.kind === 'RETURN' ? 'Return' : 'Cancellation'}</Badge> },
    { key: 'c', header: 'Customer', cell: (r) => <div><p>{r.customer.name}</p><p className="text-xs text-ink-muted">{r.customer.phone}</p></div> },
    { key: 'r', header: 'Reason', hideOnMobile: true, cell: (r) => <span className="line-clamp-2 max-w-xs text-sm">{r.reason}</span> },
    { key: 'a', header: 'Amount', cell: (r) => rupee(r.refundAmount ?? r.order.total) },
    { key: 's', header: 'Status', cell: (r) => <Badge tone={RETURN_STATUS[r.status]?.tone}>{RETURN_STATUS[r.status]?.label}</Badge> },
    { key: 'd', header: 'Raised', hideOnMobile: true, cell: (r) => dateTime(r.createdAt) },
    { key: 'x', header: 'Actions', cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.status === 'REQUESTED' && <><button className="btn-primary btn-sm" onClick={() => open(r, 'approve')}>Approve</button><button className="btn-outline btn-sm" onClick={() => open(r, 'reject')}>Reject</button></>}
        {r.status === 'APPROVED' && r.payment?.status === 'PAID' && (can(me, 'refunds') ? <button className="btn-primary btn-sm" onClick={() => open(r, 'refund')}>Pay refund</button> : <span className="text-xs text-ink-muted">Super admin pays refunds</span>)}
        {r.status === 'REFUNDED' && <span className="text-xs text-ink-muted">{r.refundMode === 'provider' ? 'Gateway' : 'Manual'} · {r.refundReference}</span>}
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Returns & Refunds" subtitle="Decide customer return and cancellation requests, then pay approved refunds." crumbs={['Orders', 'Returns & Refunds']} />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ id: 'REQUESTED', label: 'Needs decision', count: c.REQUESTED ?? 0 }, { id: 'APPROVED', label: 'Approved', count: c.APPROVED ?? 0 }, { id: 'REFUNDED', label: 'Refunded', count: c.REFUNDED ?? 0 }, { id: 'REJECTED', label: 'Rejected', count: c.REJECTED ?? 0 }, { id: 'CLOSED', label: 'Closed', count: c.CLOSED ?? 0 }]} />
      <div className="card overflow-hidden">
        <div className="border-b border-line p-4"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search order number or customer…" /></div>
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="Nothing in this list" emptyHint="Requests raised from the customer app show up here.">
          {data && <><DataTable rows={data.items} cols={cols} rowKey={(r) => r.id} caption="Returns and refunds" /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="requests" /></>}
        </Async>
      </div>
      <Modal persistent locked={busy} open={!!mode && !!sel} onClose={() => setMode(null)} title={mode === 'approve' ? 'Approve request' : mode === 'reject' ? 'Reject request' : 'Pay refund'}
        footer={<><button className="btn-outline" onClick={() => setMode(null)} disabled={busy}>Cancel</button><button className={mode === 'reject' ? 'btn-danger' : 'btn-primary'} onClick={run} disabled={busy}>{busy && <Spinner />}{mode === 'approve' ? 'Approve' : mode === 'reject' ? 'Reject' : 'Record refund'}</button></>}>
        {sel && (
          <div className="space-y-4 text-sm">
            <p><b>#{sel.order.number}</b> · {sel.customer.name} · {sel.kind === 'RETURN' ? 'Return' : 'Cancellation'}<br /><span className="text-ink-muted">“{sel.reason}”{sel.details ? ` — ${sel.details}` : ''}</span></p>
            {mode === 'approve' && <>
              {sel.payment?.status === 'PAID' ? <Field label="Refund amount (₹)" hint={`Up to ${rupee(sel.order.total)}. Money is paid in the next step.`}><input className="input" inputMode="decimal" value={amount} placeholder={String(sel.order.total)} onChange={(e) => setAmount(decimalOnly(e.target.value))} /></Field> : <p className="rounded-lg bg-cream p-2">The customer has not paid for this order, so there is nothing to refund.</p>}
              {sel.kind === 'RETURN' && <label className="flex items-center gap-2"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />Put the returned items back in stock</label>}
              {sel.kind === 'CANCELLATION' && <p className="rounded-lg bg-cream p-2">Approving cancels the order and returns its stock.</p>}
              <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
            </>}
            {mode === 'reject' && <Field label="Reason shown in the record" required><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>}
            {mode === 'refund' && <>
              <div role="radiogroup" aria-label="Refund method" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${refundMode === 'manual' ? 'border-burgundy bg-burgundy-soft' : 'border-line'}`}><input type="radio" checked={refundMode === 'manual'} onChange={() => setRefundMode('manual')} /><span><b>Returned outside the app</b><br /><span className="text-xs text-ink-muted">Cash, UPI or bank transfer you made yourself</span></span></label>
                <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${refundMode === 'provider' ? 'border-burgundy bg-burgundy-soft' : 'border-line'}`}><input type="radio" checked={refundMode === 'provider'} onChange={() => setRefundMode('provider')} /><span><b>Refund through payment gateway</b><br /><span className="text-xs text-ink-muted">Only for online payments with a connected gateway</span></span></label>
              </div>
              <Field label="Amount (₹)"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(decimalOnly(e.target.value))} /></Field>
              {refundMode === 'manual' && <Field label="Reference" required hint="Receipt number, UPI reference or bank transaction id"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} /></Field>}
              <p className="text-xs text-ink-muted">This is recorded in the audit log with your name.</p>
            </>}
          </div>
        )}
      </Modal>
    </>
  );
}
