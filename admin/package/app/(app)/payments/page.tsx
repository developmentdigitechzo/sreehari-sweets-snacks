'use client';
import { CheckCircle2, CircleSlash } from 'lucide-react';
import { useCallback, useState } from 'react';
import { qs, useFetch } from '@/lib/api';
import { dateTime, rupee2 } from '@/lib/format';
import { Async, Badge, PageHeader, Pagination, SearchInput, Select, StatCard } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { METHOD, PAY } from '@/lib/status';

type P = { id: string; orderNumber: string; customer: string; phone: string; method: string; status: string; amount: number; provider: string; simulated: boolean; reference: string; providerPaymentId: string | null; createdAt: string };
type List = { items: P[]; total: number; page: number; pages: number; pageSize: number; summary: { status: string; count: number; amount: number }[] };
type Integ = Record<string, { provider: string; connected: boolean; live?: boolean }>;

export default function Payments() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<List>(`admin/payments${qs({ q, status, method, page, pageSize: 10 })}`);
  const integ = useFetch<Integ>('admin/integrations');
  const setQ_ = useCallback((v: string) => { setQ(v); setPage(1); }, []);
  const sum = (s: string) => data?.summary.find((x) => x.status === s);

  const cols: Col<P>[] = [
    { key: 'o', title: true, header: 'Order', cell: (p) => <span className="font-bold text-burgundy">#{p.orderNumber}</span> },
    { key: 'c', header: 'Customer', cell: (p) => <div><p>{p.customer}</p><p className="text-xs text-ink-muted">{p.phone}</p></div> },
    { key: 'm', header: 'Method', cell: (p) => METHOD[p.method] },
    { key: 'a', header: 'Amount', cell: (p) => <b>{rupee2(p.amount)}</b> },
    { key: 's', header: 'Status', cell: (p) => <Badge tone={PAY[p.status]?.tone}>{PAY[p.status]?.label}</Badge> },
    { key: 'p', header: 'Source', hideOnMobile: true, cell: (p) => (p.simulated ? <Badge tone="gold">Simulated</Badge> : <Badge tone="info">{p.provider}</Badge>) },
    { key: 'r', header: 'Reference', hideOnMobile: true, cell: (p) => <span className="text-xs">{p.providerPaymentId ?? p.reference}</span> },
    { key: 'd', header: 'Date', hideOnMobile: true, cell: (p) => dateTime(p.createdAt) },
  ];
  return (
    <>
      <PageHeader title="Payments" subtitle="Payment history and provider status. Refunds are handled from Returns & Refunds." crumbs={['Payments']} />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard icon={<CheckCircle2 />} label="Paid" value={rupee2(sum('PAID')?.amount ?? 0)} sub={`${sum('PAID')?.count ?? 0} payments`} tone="ok" />
        <StatCard icon={<CircleSlash />} label="Pending / processing" value={(sum('PENDING')?.count ?? 0) + (sum('PROCESSING')?.count ?? 0)} tone="warn" />
        <StatCard icon={<CircleSlash />} label="COD to collect" value={rupee2(sum('COD_DUE')?.amount ?? 0)} sub={`${sum('COD_DUE')?.count ?? 0} orders`} tone="gold" />
        <StatCard icon={<CircleSlash />} label="Refunded" value={rupee2(sum('REFUNDED')?.amount ?? 0)} sub={`${sum('REFUNDED')?.count ?? 0} payments`} />
      </div>
      <section className="card mb-5 p-4" aria-label="Provider status">
        <h2 className="mb-2 section-title">Provider status</h2>
        {integ.data ? (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[['payments', 'Online payments'], ['smsMarketing', 'SMS'], ['whatsapp', 'WhatsApp'], ['push', 'Push notifications'], ['sms', 'OTP login (SMS)'], ['email', 'Email'], ['geocoding', 'Address lookup']].map(([k, l]) => (
              <li key={k} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm"><span>{l}</span>{integ.data![k].connected ? <Badge tone="ok" dot>{integ.data![k].live === false ? 'Test mode' : 'Connected'}</Badge> : <Badge tone="gray" dot>Not connected</Badge>}</li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-muted">Loading…</p>}
        <p className="mt-2 text-xs text-ink-muted">“Not connected” means the server has no credentials for that service. Nothing is sent or charged through it. Credentials are set on the server, never in this panel.</p>
      </section>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ_} placeholder="Search order, reference or payment id…" />
          <Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: 'all', label: 'All statuses' }, ...Object.entries(PAY).map(([v, p]) => ({ value: v, label: p.label }))]} />
          <Select label="Method" value={method} onChange={(v) => { setMethod(v); setPage(1); }} options={[{ value: 'all', label: 'All methods' }, ...Object.entries(METHOD).map(([v, l]) => ({ value: v, label: l }))]} />
        </div>
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No payments match">
          {data && <><DataTable rows={data.items} cols={cols} rowKey={(p) => p.id} caption="Payments" /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="payments" /></>}
        </Async>
      </div>
    </>
  );
}
