'use client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { date, decimalOnly, digitsOnly, toIso, toLocalInput } from '@/lib/format';
import { Async, Badge, ConfirmDialog, Field, Modal, PageHeader, Pagination, SearchInput, Spinner } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type Coupon = { code: string; title: string; description: string; type: 'PERCENT' | 'FLAT' | 'FREESHIP'; value: number; minOrder: number; maxDiscount: number | null; startsAt: string | null; expiresAt: string | null; usageLimit: number | null; usedCount: number; categoryIds: string[]; productIds: string[]; isActive: boolean; state: string };
type List = { items: Coupon[]; total: number; page: number; pages: number; pageSize: number };
type Cats = { items: { id: string; name: string }[] };
const STATE: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'gray' | 'info' }> = { active: { label: 'Active', tone: 'ok' }, scheduled: { label: 'Scheduled', tone: 'info' }, expired: { label: 'Expired', tone: 'bad' }, exhausted: { label: 'Limit reached', tone: 'warn' }, inactive: { label: 'Off', tone: 'gray' } };

type Form = { code: string; title: string; description: string; type: Coupon['type']; value: string; minOrder: string; maxDiscount: string; startsAt: string; expiresAt: string; usageLimit: string; categoryIds: string[]; isActive: boolean; existing: boolean; productIds: string[] };
const blank: Form = { code: '', title: '', description: '', type: 'PERCENT', value: '10', minOrder: '0', maxDiscount: '', startsAt: '', expiresAt: '', usageLimit: '', categoryIds: [], isActive: true, existing: false, productIds: [] };

export default function Offers() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<List>(`admin/coupons${qs({ q, page, pageSize: 10 })}`);
  const cats = useFetch<Cats>('admin/categories');
  const [f, setF] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [del, setDel] = useState<Coupon | null>(null);
  const [busy, setBusy] = useState(false);
  const setQ_ = useCallback((v: string) => { setQ(v); setPage(1); }, []);

  const edit = (c?: Coupon) => {
    setErrs({});
    setF(c ? { code: c.code, title: c.title, description: c.description, type: c.type, value: String(c.value), minOrder: String(c.minOrder), maxDiscount: c.maxDiscount != null ? String(c.maxDiscount) : '', startsAt: toLocalInput(c.startsAt), expiresAt: toLocalInput(c.expiresAt), usageLimit: c.usageLimit != null ? String(c.usageLimit) : '', categoryIds: c.categoryIds, productIds: c.productIds, isActive: c.isActive, existing: true } : { ...blank });
  };
  const save = async () => {
    if (!f || busy) return;
    const e: Record<string, string> = {};
    if (!/^[A-Za-z0-9]{3,20}$/.test(f.code)) e.code = '3–20 letters or numbers';
    if (f.title.trim().length < 2) e.title = 'Enter a title';
    const v = Number(f.value);
    if (f.type === 'PERCENT' && !(v > 0 && v <= 100)) e.value = '1–100';
    if (f.type === 'FLAT' && !(v > 0)) e.value = 'Enter an amount';
    if (f.minOrder && !(Number(f.minOrder) >= 0)) e.minOrder = 'Enter an amount';
    if (f.type === 'PERCENT' && f.maxDiscount && !(Number(f.maxDiscount) > 0)) e.maxDiscount = 'Enter an amount';
    if (f.usageLimit && !(Number(f.usageLimit) >= 1)) e.usageLimit = 'At least 1';
    if (f.expiresAt && f.startsAt && new Date(f.expiresAt) <= new Date(f.startsAt)) e.expiresAt = 'Must be after the start';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = { code: f.code.toUpperCase(), title: f.title.trim(), description: f.description.trim(), type: f.type, value: f.type === 'FREESHIP' ? 0 : v, minOrder: Number(f.minOrder || 0), maxDiscount: f.maxDiscount ? Number(f.maxDiscount) : null, startsAt: toIso(f.startsAt), expiresAt: toIso(f.expiresAt), usageLimit: f.usageLimit ? Number(f.usageLimit) : null, categoryIds: f.categoryIds, productIds: f.productIds, isActive: f.isActive };
    try { await api(f.existing ? `admin/coupons/${f.code}` : 'admin/coupons', { method: f.existing ? 'PUT' : 'POST', body }); toast('Coupon saved'); setF(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try { await api(`admin/coupons/${del.code}`, { method: 'DELETE' }); toast('Coupon deleted'); setDel(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };
  const toggle = async (c: Coupon) => {
    try { await api(`admin/coupons/${c.code}`, { method: 'PUT', body: { ...c, startsAt: c.startsAt, expiresAt: c.expiresAt, isActive: !c.isActive } }); toast(`${c.code} ${c.isActive ? 'switched off' : 'switched on'}`); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
  };

  const cols: Col<Coupon>[] = [
    { key: 'c', title: true, header: 'Code', cell: (c) => <div><p className="font-bold tracking-wide text-burgundy">{c.code}</p><p className="text-xs text-ink-muted">{c.title}</p></div> },
    { key: 'o', header: 'Offer', cell: (c) => (c.type === 'PERCENT' ? `${c.value}% off${c.maxDiscount ? ` (max ₹${c.maxDiscount})` : ''}` : c.type === 'FLAT' ? `₹${c.value} off` : 'Free delivery') },
    { key: 'm', header: 'Min. order', hideOnMobile: true, cell: (c) => `₹${c.minOrder}` },
    { key: 'e', header: 'Eligibility', hideOnMobile: true, cell: (c) => (c.categoryIds.length || c.productIds.length ? `${c.categoryIds.length} categories` + (c.productIds.length ? `, ${c.productIds.length} products` : '') : 'Whole cart') },
    { key: 'v', header: 'Valid', hideOnMobile: true, cell: (c) => `${c.startsAt ? date(c.startsAt) : 'Now'} – ${c.expiresAt ? date(c.expiresAt) : 'No end'}` },
    { key: 'u', header: 'Used', cell: (c) => `${c.usedCount}${c.usageLimit ? ` / ${c.usageLimit}` : ''}` },
    { key: 's', header: 'Status', cell: (c) => <Badge tone={STATE[c.state].tone} dot>{STATE[c.state].label}</Badge> },
    { key: 'a', header: 'Actions', cell: (c) => (
      <div className="flex gap-1">
        <button className="icon-btn" aria-label={`Edit ${c.code}`} onClick={() => edit(c)}><Pencil className="h-4 w-4" /></button>
        <button className="btn-ghost btn-sm !px-2 text-xs" onClick={() => toggle(c)}>{c.isActive ? 'Turn off' : 'Turn on'}</button>
        <button className="icon-btn icon-btn-bad" aria-label={`Delete ${c.code}`} onClick={() => setDel(c)}><Trash2 className="h-4 w-4" /></button>
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Offers & Coupons" subtitle="Fixed and percentage discounts, free delivery, validity dates, usage limits and category eligibility." crumbs={['Offers & Rewards', 'Coupons']} actions={<button className="btn-primary" onClick={() => edit()}><Plus className="h-4 w-4" />New coupon</button>} />
      <div className="card overflow-hidden">
        <div className="border-b border-line p-4"><SearchInput value={q} onChange={setQ_} placeholder="Search code or title…" /></div>
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No coupons yet">
          {data && <><DataTable rows={data.items} cols={cols} rowKey={(c) => c.code} caption="Coupons" /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="coupons" /></>}
        </Async>
      </div>
      <Modal wide persistent locked={busy} open={!!f} onClose={() => setF(null)} title={f?.existing ? `Edit ${f.code}` : 'New coupon'} footer={<><button className="btn-outline" onClick={() => setF(null)} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Save coupon</button></>}>
        {f && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Coupon code" required error={errs.code}><input className="input uppercase" value={f.code} disabled={f.existing} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={20} /></Field>
            <Field label="Title" required error={errs.title}><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} /></Field>
            <Field label="Type"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Coupon['type'] })}><option value="PERCENT">Percentage discount</option><option value="FLAT">Fixed amount off</option><option value="FREESHIP">Free delivery</option></select></Field>
            {f.type !== 'FREESHIP' && <Field label={f.type === 'PERCENT' ? 'Percentage (%)' : 'Amount (₹)'} required error={errs.value}><input className="input" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: decimalOnly(e.target.value) })} /></Field>}
            <Field label="Minimum order (₹)" error={errs.minOrder}><input className="input" inputMode="decimal" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: decimalOnly(e.target.value) })} /></Field>
            {f.type === 'PERCENT' && <Field label="Maximum discount (₹)" hint="Optional cap" error={errs.maxDiscount}><input className="input" inputMode="decimal" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: decimalOnly(e.target.value) })} /></Field>}
            <Field label="Starts"><input className="input" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
            <Field label="Expires" error={errs.expiresAt}><input className="input" type="datetime-local" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></Field>
            <Field label="Total usage limit" hint="Leave empty for unlimited" error={errs.usageLimit}><input className="input" inputMode="numeric" value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: digitsOnly(e.target.value) })} /></Field>
            <label className="flex min-h-[42px] items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />Active</label>
            <div className="sm:col-span-2"><Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={200} /></Field></div>
            <fieldset className="sm:col-span-2">
              <legend className="label">Only valid for these categories <span className="font-normal text-ink-muted">(none selected = the whole cart)</span></legend>
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl border border-line p-2">
                {cats.data?.items.map((c) => <label key={c.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${f.categoryIds.includes(c.id) ? 'border-burgundy bg-burgundy text-white' : 'border-line'}`}><input type="checkbox" className="sr-only" checked={f.categoryIds.includes(c.id)} onChange={() => setF({ ...f, categoryIds: f.categoryIds.includes(c.id) ? f.categoryIds.filter((x) => x !== c.id) : [...f.categoryIds, c.id] })} />{c.name}</label>)}
              </div>
            </fieldset>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} danger busy={busy} onClose={() => setDel(null)} onConfirm={remove} title="Delete coupon?" confirmLabel="Delete" message={<p><b>{del?.code}</b> will be deleted. Coupons already used on orders cannot be deleted; switch them off instead.</p>} />
    </>
  );
}
