'use client';
import { Ban, Download, Eye, RotateCcw, ShoppingCart, Truck, Wallet, CheckCircle2, Package } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { dateTime, num, rupee, rupee2 } from '@/lib/format';
import { Async, Badge, ConfirmDialog, Field, PageHeader, Pagination, SearchInput, Select, SidePanel, StatCard, Tabs } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';
import { useRange } from '@/components/Shell';
import { METHOD, PAY, STATUS } from '@/lib/status';

type Row = { id: string; number: string; customer: string; phone: string; items: number; total: number; status: string; payment: { method: string; status: string; simulated: boolean } | null; createdAt: string; isDemo: boolean };
type List = { items: Row[]; total: number; page: number; pages: number; pageSize: number; tabs: Record<string, number>; stats: { orders: number; ordersDelta: number | null; value: number; valueDelta: number | null; delivered: number; inTransit: number; cancelled: number; returns: number } };
type Detail = {
  id: string; number: string; status: string; createdAt: string; isDemo: boolean; couponCode: string | null; nextStatus: { value: string; label: string } | null; canCancel: boolean;
  customer: { id: string; name: string; phone: string; email: string | null }; address: { name: string; phone: string; line1: string; area: string; city: string; pincode: string; landmark?: string; latitude?: number; longitude?: number } | null; slot: { title?: string; window?: string; date?: string } | null;
  items: { id: string; name: string; sku: string; size: string; qty: number; unitPrice: number; options: { flavour?: string; message?: string } | null; imageUrl: string | null }[];
  totals: { subtotal: number; couponDiscount: number; rewardDiscount: number; deliveryFee: number; total: number };
  payment: { method: string; status: string; amount: number; reference: string; provider: string; simulated: boolean } | null;
  events: { status: string; label: string; actor: string; at: string }[];
  returnRequests: { id: string; kind: string; status: string; reason: string }[];
};

function Orders() {
  const days = useRange();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') ?? 'all');
  const [payment, setPayment] = useState('all');
  const [slot, setSlot] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState<string | null>(params.get('open'));
  const list = useFetch<List>(`admin/orders${qs({ tab, payment, slot, q, page, pageSize, days })}`);
  // New orders arrive while the page is open: refresh quietly every 30 s, only while the tab is visible and no order panel is open.
  const { reload: reloadList } = list;
  useEffect(() => {
    if (open) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') reloadList(); }, 30_000);
    return () => clearInterval(t);
  }, [open, reloadList]);
  const setQ_ = useCallback((v: string) => { setQ(v); setPage(1); }, []);
  const d = list.data;
  const t = d?.tabs;

  const cols: Col<Row>[] = [
    { key: 'id', title: true, header: 'Order ID', cell: (r) => <span className="font-bold text-burgundy">#{r.number}</span> },
    { key: 'c', header: 'Customer', cell: (r) => <div><p className="font-medium">{r.customer}</p><p className="text-xs text-ink-muted">{r.phone}</p></div> },
    { key: 'i', header: 'Items', hideOnMobile: true, cell: (r) => r.items },
    { key: 't', header: 'Order Value', cell: (r) => <b>{rupee(r.total)}</b> },
    { key: 'p', header: 'Payment', cell: (r) => (r.payment ? <Badge tone={PAY[r.payment.status]?.tone}>{r.payment.status === 'COD_DUE' ? 'COD' : PAY[r.payment.status]?.label}{r.payment.simulated ? ' · demo' : ''}</Badge> : '—') },
    { key: 's', header: 'Status', cell: (r) => <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label}</Badge> },
    { key: 'd', header: 'Order Date', hideOnMobile: true, cell: (r) => dateTime(r.createdAt) },
    { key: 'a', header: 'Actions', cell: (r) => <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }} aria-label={`View order ${r.number}`}><Eye className="h-5 w-5" /></button> },
  ];

  const exportCsv = async () => {
    try {
      const csv = await api<string>(`admin/orders${qs({ tab, payment, slot, q, format: 'csv', days })}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'orders.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <>
      <PageHeader title="Order Management" subtitle="View, process and manage all customer orders in one place." crumbs={['Orders']} />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={<ShoppingCart />} label="Total Orders" value={d ? num(d.stats.orders) : '—'} change={d?.stats.ordersDelta} />
        <StatCard icon={<Wallet />} label="Order Value" value={d ? rupee(d.stats.value) : '—'} change={d?.stats.valueDelta} tone="gold" />
        <StatCard icon={<Package />} label="Delivered" value={d ? num(d.stats.delivered) : '—'} tone="ok" />
        <StatCard icon={<Truck />} label="In Transit" value={d ? num(d.stats.inTransit) : '—'} />
        <StatCard icon={<Ban />} label="Cancelled" value={d ? num(d.stats.cancelled) : '—'} tone="bad" />
        <StatCard icon={<RotateCcw />} label="Returns" value={d ? num(d.stats.returns) : '—'} tone="warn" />
      </div>
      <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={[
        { id: 'all', label: 'All Orders', count: t?.all }, { id: 'pending', label: 'Pending', count: t?.pending }, { id: 'processing', label: 'Processing', count: t?.processing }, { id: 'packed', label: 'Packed', count: t?.packed },
        { id: 'transit', label: 'In Transit', count: t?.transit }, { id: 'delivered', label: 'Delivered', count: t?.delivered }, { id: 'cancelled', label: 'Cancelled', count: t?.cancelled }, { id: 'returns', label: 'Returns', count: t?.returns },
      ]} />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ_} placeholder="Search Order ID, customer name or mobile…" />
          <Select label="Payment status" value={payment} onChange={(v) => { setPayment(v); setPage(1); }} options={[{ value: 'all', label: 'Payment Status' }, ...Object.entries(PAY).map(([v, p]) => ({ value: v, label: p.label }))]} />
          <Select label="Delivery type" value={slot} onChange={(v) => { setSlot(v); setPage(1); }} options={[{ value: 'all', label: 'Delivery Type' }, { value: 'express', label: 'Express' }, { value: 'slot-1', label: 'Slot 1–3 PM' }, { value: 'slot-2', label: 'Slot 4–6 PM' }]} />
          <button className="btn-outline" onClick={exportCsv}><Download className="h-4 w-4" />Export</button>
        </div>
        <Async loading={list.loading} error={list.error} hasData={!!d} onRetry={list.reload} empty={d?.total === 0} emptyTitle="No orders match" emptyHint="Change the tab or filters.">
          {d && <>
            <DataTable rows={d.items} cols={cols} rowKey={(r) => r.id} caption="Orders" onRowClick={(r) => setOpen(r.id)} />
            <Pagination page={d.page} pages={d.pages} total={d.total} pageSize={d.pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="orders" />
          </>}
        </Async>
      </div>
      <OrderPanel id={open} onClose={() => setOpen(null)} onChanged={list.reload} />
    </>
  );
}

function OrderPanel({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useFetch<Detail>(id ? `admin/orders/${id}` : null);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!id) { setCancel(false); setReason(''); } }, [id]);

  const move = async (status: string, why?: string) => {
    setBusy(true);
    try {
      const r = await api<{ refundNeeded: boolean }>(`admin/orders/${id}/status`, { method: 'POST', body: { status, reason: why } });
      toast(status === 'CANCELLED' ? (r.refundNeeded ? 'Order cancelled. A refund request was opened in Returns & Refunds.' : 'Order cancelled and stock returned') : 'Order updated');
      setCancel(false); setReason(''); reload(); onChanged();
    } catch (e) { toast((e as Error).message, 'bad'); reload(); }
    setBusy(false);
  };

  const a = data?.address;
  return (
    <SidePanel open={!!id} onClose={onClose} title="Order Details" footer={data && (data.nextStatus || data.canCancel) ? (
      <div className="flex flex-col gap-2">
        {data.nextStatus && <button className="btn-primary" disabled={busy} onClick={() => move(data.nextStatus!.value)}><CheckCircle2 className="h-4 w-4" />Mark as {data.nextStatus.label}</button>}
        {data.canCancel && <button className="btn-outline !border-bad/40 !text-bad" disabled={busy} onClick={() => setCancel(true)}><Ban className="h-4 w-4" />Cancel order</button>}
      </div>) : undefined}>
      <Async loading={loading} error={error} hasData={!!data} onRetry={reload}>
        {data && (
          <div className="space-y-5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-serif text-xl font-bold">Order #{data.number}</p><p className="text-ink-muted">{dateTime(data.createdAt)}</p></div>
              <Badge tone={STATUS[data.status]?.tone}>{STATUS[data.status]?.label}</Badge>
            </div>
            {data.isDemo && <p className="rounded-lg bg-gold-soft p-2 text-xs">Demo order: payment and delivery are simulated.</p>}
            <section><h3 className="mb-1 font-semibold">Customer</h3><p>{data.customer.name}</p><a className="text-burgundy underline" href={`tel:${data.customer.phone}`}>{data.customer.phone}</a>{data.customer.email && <p className="text-ink-muted">{data.customer.email}</p>}</section>
            <section><h3 className="mb-1 font-semibold">Delivery address</h3>{a ? <p>{a.name}, {a.line1}, {a.area}, {a.city} - {a.pincode}{a.landmark ? ` (near ${a.landmark})` : ''}<br /><span className="text-ink-muted">{a.phone}</span></p> : <p className="text-ink-muted">Not recorded</p>}
              {data.slot && <p className="mt-1 text-ink-muted">Delivery: {data.slot.date ? `${data.slot.date} · ` : ''}{data.slot.title} {data.slot.window}</p>}</section>
            <section><h3 className="mb-2 font-semibold">Items ({data.items.length})</h3>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {data.items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2 p-3"><div className="min-w-0"><p className="font-medium">{i.name} <span className="text-ink-muted">({i.size})</span></p>{i.options?.flavour && <p className="text-xs text-ink-muted">Flavour: {i.options.flavour}</p>}{i.options?.message && <p className="text-xs text-ink-muted">Message: “{i.options.message}”</p>}<p className="text-xs text-ink-faint">{i.sku}</p></div><div className="text-right"><p>× {i.qty}</p><p className="font-semibold">{rupee2(i.unitPrice * i.qty)}</p></div></li>
                ))}
              </ul></section>
            <section className="space-y-1 rounded-xl bg-cream p-3">
              <div className="flex justify-between"><span>Subtotal</span><span>{rupee2(data.totals.subtotal)}</span></div>
              {data.totals.couponDiscount > 0 && <div className="flex justify-between text-ok"><span>Coupon {data.couponCode}</span><span>− {rupee2(data.totals.couponDiscount)}</span></div>}
              {data.totals.rewardDiscount > 0 && <div className="flex justify-between text-ok"><span>Rewards</span><span>− {rupee2(data.totals.rewardDiscount)}</span></div>}
              <div className="flex justify-between"><span>Delivery fee</span><span>{rupee2(data.totals.deliveryFee)}</span></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-burgundy"><span>Total</span><span>{rupee2(data.totals.total)}</span></div>
            </section>
            {data.payment && <section><h3 className="mb-1 font-semibold">Payment</h3><p>{METHOD[data.payment.method]} · <Badge tone={PAY[data.payment.status]?.tone}>{PAY[data.payment.status]?.label}</Badge></p><p className="text-xs text-ink-muted">Ref {data.payment.reference} · {data.payment.simulated ? 'simulated (demo)' : data.payment.provider}</p></section>}
            {data.returnRequests.length > 0 && <section><h3 className="mb-1 font-semibold">Return / cancellation requests</h3>{data.returnRequests.map((r) => <p key={r.id}>{r.kind === 'RETURN' ? 'Return' : 'Cancellation'}: {r.reason} <Badge tone="gray">{r.status}</Badge></p>)}</section>}
            <section><h3 className="mb-2 font-semibold">History</h3>
              <ol className="space-y-2 border-l-2 border-line pl-4">
                {data.events.map((e, i) => <li key={i}><p className="font-medium">{e.label}</p><p className="text-xs text-ink-muted">{dateTime(e.at)} · {e.actor.startsWith('admin:') ? 'Store staff' : e.actor.startsWith('customer:') ? 'Customer' : e.actor}</p></li>)}
              </ol></section>
          </div>
        )}
      </Async>
      <ConfirmDialog open={cancel} danger busy={busy} onClose={() => setCancel(false)} onConfirm={() => (reason.trim().length >= 3 ? move('CANCELLED', reason.trim()) : toast('Give a reason (3+ characters)', 'bad'))} title="Cancel this order?" confirmLabel="Cancel order"
        message={<p>Stock goes back on the shelf and any coupon or reward points used are returned. If the customer already paid online, a refund request is opened for you to process.</p>}>
        <Field label="Reason" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></Field>
      </ConfirmDialog>
    </SidePanel>
  );
}

export default function OrdersPage() {
  return <Suspense><Orders /></Suspense>;
}
