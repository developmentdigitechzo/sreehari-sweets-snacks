'use client';
import { BarChart3, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { date, num, rupee, toIso, toLocalInput } from '@/lib/format';
import { Async, Badge, ConfirmDialog, Field, Modal, PageHeader, Pagination, Spinner } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type C = { id: string; name: string; kind: string; offerText: string; couponCode: string | null; startsAt: string | null; endsAt: string | null; recurrence: string | null; isActive: boolean; state: string; results: { orders: number; revenue: number; newCustomers: number; tracked: boolean } };
type List = { items: C[]; total: number; page: number; pages: number; pageSize: number };
const KIND: Record<string, string> = { festive: 'Festive', flash_deal: 'Flash Deal', acquisition: 'Acquisition', loyalty: 'Loyalty', other: 'Other' };
const STATE: Record<string, { label: string; tone: 'ok' | 'info' | 'bad' | 'gray' }> = { active: { label: 'Active', tone: 'ok' }, scheduled: { label: 'Scheduled', tone: 'info' }, ended: { label: 'Ended', tone: 'bad' }, inactive: { label: 'Off', tone: 'gray' } };
type Form = { id?: string; name: string; kind: string; offerText: string; couponCode: string; startsAt: string; endsAt: string; recurrence: string; isActive: boolean };

export default function Campaigns() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<List>(`admin/campaigns${qs({ page, pageSize: 10 })}`);
  const coupons = useFetch<{ items: { code: string; title: string }[] }>('admin/coupons?pageSize=100');
  const [f, setF] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [del, setDel] = useState<C | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (c?: C) => { setErrs({}); setF(c ? { id: c.id, name: c.name, kind: c.kind, offerText: c.offerText, couponCode: c.couponCode ?? '', startsAt: toLocalInput(c.startsAt), endsAt: toLocalInput(c.endsAt), recurrence: c.recurrence ?? '', isActive: c.isActive } : { name: '', kind: 'festive', offerText: '', couponCode: '', startsAt: '', endsAt: '', recurrence: '', isActive: true }); };
  const save = async () => {
    if (!f || busy) return;
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = 'Enter a name';
    if (f.offerText.trim().length < 2) e.offerText = 'Describe the offer';
    if (f.startsAt && f.endsAt && new Date(f.endsAt) <= new Date(f.startsAt)) e.endsAt = 'Must be after the start';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api(f.id ? `admin/campaigns/${f.id}` : 'admin/campaigns', { method: f.id ? 'PUT' : 'POST', body: { name: f.name.trim(), kind: f.kind, offerText: f.offerText.trim(), couponCode: f.couponCode || null, startsAt: toIso(f.startsAt), endsAt: toIso(f.endsAt), recurrence: f.recurrence.trim() || null, isActive: f.isActive } }); toast('Campaign saved'); setF(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try { await api(`admin/campaigns/${del.id}`, { method: 'DELETE' }); toast('Campaign deleted'); setDel(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };

  const cols: Col<C>[] = [
    { key: 'n', title: true, header: 'Campaign name', cell: (c) => <div><p className="font-semibold">{c.name}</p><p className="text-xs text-ink-muted">{c.couponCode ? `Coupon ${c.couponCode}` : 'No coupon linked'}</p></div> },
    { key: 'k', header: 'Type', cell: (c) => <Badge tone="gold">{KIND[c.kind]}</Badge> },
    { key: 'o', header: 'Offer', cell: (c) => c.offerText },
    { key: 'd', header: 'Duration', hideOnMobile: true, cell: (c) => c.recurrence ?? `${c.startsAt ? date(c.startsAt) : 'Now'} – ${c.endsAt ? date(c.endsAt) : 'Ongoing'}` },
    { key: 's', header: 'Status', cell: (c) => <Badge tone={STATE[c.state].tone} dot>{STATE[c.state].label}</Badge> },
    { key: 'r', header: 'Results', cell: (c) => (c.results.tracked ? <span className="text-sm">{rupee(c.results.revenue)} revenue<br />{num(c.results.orders)} orders</span> : <span className="text-xs text-ink-muted">Link a coupon to track results</span>) },
    { key: 'a', header: 'Actions', cell: (c) => (
      <div className="flex gap-1">
        <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => open(c)}><Pencil className="h-4 w-4" /></button>
        <button className="icon-btn icon-btn-bad" aria-label={`Delete ${c.name}`} onClick={() => setDel(c)}><Trash2 className="h-4 w-4" /></button>
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Run time-bound offers, discounts and special promotions. Results come from real orders that used the campaign coupon." crumbs={['Banners & Campaigns', 'Campaigns']} actions={<button className="btn-primary" onClick={() => open()}><Plus className="h-4 w-4" />New campaign</button>} />
      <div className="card overflow-hidden">
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No campaigns yet" emptyHint="Create a coupon first, then link it to a campaign to see revenue and orders.">
          {data && <><DataTable rows={data.items} cols={cols} rowKey={(c) => c.id} caption="Campaigns" /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="campaigns" /></>}
        </Async>
      </div>
      <p className="mt-3 text-xs text-ink-muted">An active campaign inside its dates is shown in the customer app on Home and on the Offers screen (latest 5), with its offer text and coupon code. The discount itself comes from the linked coupon.</p>
      <p className="mt-2 flex items-center gap-2 text-xs text-ink-muted"><BarChart3 className="h-4 w-4" aria-hidden />Revenue counts orders that used the linked coupon between the campaign&apos;s start and end, excluding cancelled orders.</p>
      <Modal persistent locked={busy} open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit campaign' : 'New campaign'} footer={<><button className="btn-outline" onClick={() => setF(null)} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Save campaign</button></>}>
        {f && (
          <div className="space-y-4">
            <Field label="Campaign name" required error={errs.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} /></Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Linked coupon" hint="Used to measure results"><select className="input" value={f.couponCode} onChange={(e) => setF({ ...f, couponCode: e.target.value })}><option value="">None</option>{coupons.data?.items.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.title}</option>)}</select></Field>
            </div>
            <Field label="Offer" required error={errs.offerText}><input className="input" value={f.offerText} onChange={(e) => setF({ ...f, offerText: e.target.value })} maxLength={120} placeholder="Flat 15% OFF" /></Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Starts"><input className="input" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
              <Field label="Ends" error={errs.endsAt}><input className="input" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
            </div>
            <Field label="Repeats (label only)" hint="For example “Every Sat–Sun”"><input className="input" value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })} maxLength={60} /></Field>
            <label className="flex min-h-[42px] items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />Active</label>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} danger busy={busy} onClose={() => setDel(null)} onConfirm={remove} title="Delete campaign?" confirmLabel="Delete" message={<p><b>{del?.name}</b> will be deleted. The linked coupon is not changed.</p>} />
    </>
  );
}
