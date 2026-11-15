'use client';
import { Star } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, useFetch } from '@/lib/api';
import { num } from '@/lib/format';
import { Async, Field, PageHeader, Pagination, Spinner, StatCard } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type Rules = { earnPer100: number; pointsPerRupee: number; earn: string; redeem: string };
type Data = { items: { customerId: string; name: string; phone: string; points: number }[]; total: number; page: number; pages: number; pageSize: number; members: number; outstandingPoints: number; rules: Rules };

/** A positive number with at most two decimals. */
const money = /^\d+(\.\d{1,2})?$/;

export default function Rewards() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<Data>(`admin/rewards?page=${page}&pageSize=10`);
  const [earn, setEarn] = useState('');
  const [redeem, setRedeem] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setEarn(String(data.rules.earnPer100)); setRedeem(String(data.rules.pointsPerRupee)); } }, [data]);

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const e: Record<string, string> = {};
    if (!money.test(earn) || Number(earn) > 1000) e.earn = 'A number from 0 to 1000';
    if (!money.test(redeem) || Number(redeem) < 0.1 || Number(redeem) > 1000) e.redeem = 'A number from 0.1 to 1000';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api('admin/rewards/rules', { method: 'PUT', body: { earnPer100: Number(earn), pointsPerRupee: Number(redeem) } }); toast('Reward rules saved. The app uses them from the next order.'); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };

  const cols: Col<Data['items'][number]>[] = [
    { key: 'n', title: true, header: 'Member', cell: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-ink-muted">{r.phone}</p></div> },
    { key: 'p', header: 'Points', cell: (r) => <b>{num(r.points)}</b> },
    { key: 'a', header: 'Adjust', cell: () => <Link className="text-sm font-semibold text-burgundy" href="/customers">Open in Customers</Link> },
  ];
  return (
    <>
      <PageHeader title="Rewards" subtitle="Customers with a points balance. Points are earned on orders and redeemed at checkout." crumbs={['Offers & Rewards', 'Rewards']} />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
        <StatCard icon={<Star />} label="Rewards members" value={data ? num(data.members) : '—'} tone="gold" />
        <StatCard icon={<Star />} label="Outstanding points" value={data ? num(data.outstandingPoints) : '—'} />
        <div className="card p-4 text-sm"><p className="font-semibold">Current rules</p><p className="text-ink-muted">{data?.rules.earn}</p><p className="text-ink-muted">{data?.rules.redeem}</p></div>
      </div>
      <form onSubmit={save} noValidate className="card mb-5 max-w-3xl space-y-4 p-4 sm:p-5">
        <p className="font-semibold">Reward rules</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Points earned per ₹100 spent" error={errs.earn} hint="10 means 1 point for every ₹10"><input className="input" inputMode="decimal" value={earn} onChange={(e) => setEarn(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          <Field label="Points needed for ₹1 off" error={errs.redeem} hint="10 means 10 points = ₹1"><input className="input" inputMode="decimal" value={redeem} onChange={(e) => setRedeem(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        </div>
        <button className="btn-primary" type="submit" disabled={busy || !data}>{busy && <Spinner />}Save rules</button>
        <p className="text-xs text-ink-muted">Points already earned keep their value count; only new orders and new redemptions use the new rules.</p>
      </form>
      <div className="card overflow-hidden">
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No points issued yet" emptyHint="Points appear after orders are delivered or paid.">
          {data && <><DataTable rows={data.items} cols={cols} rowKey={(r) => r.customerId} caption="Rewards members" /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="members" /></>}
        </Async>
      </div>
    </>
  );
}
