'use client';
import { Copy, Eye as EyeIcon, MousePointerClick, Pencil, Percent, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { date, digitsOnly, num, toIso, toLocalInput } from '@/lib/format';
import { Async, Badge, ConfirmDialog, Field, Modal, PageHeader, Pagination, Spinner, StatCard } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Thumb } from '@/components/ui/Thumb';
import { toast } from '@/components/ui/Toast';
import { useRange } from '@/components/Shell';

type Group = 'banners' | 'popups' | 'sections';
type B = { id: string; title: string; eyebrow: string; accent: string | null; cta: string; placement: string; imageUrl: string | null; targetType: 'collection' | 'offers' | 'search'; targetId: string | null; sortOrder: number; startsAt: string | null; endsAt: string | null; isActive: boolean; state: string; views: number; clicks: number };
type List = { items: B[]; total: number; page: number; pages: number; pageSize: number; counts: { banners: number; popups: number; sections: number; campaigns: number }; stats: { views: number; viewsDelta: number | null; clicks: number; clicksDelta: number | null } };
const PLACE: Record<string, string> = { home_slider: 'Home Slider', category: 'Category Banner', promo: 'Promo Banner', popup: 'Offer Popup', section: 'Promotional Section' };
const STATE: Record<string, { label: string; tone: 'ok' | 'info' | 'bad' | 'gray' }> = { active: { label: 'Active', tone: 'ok' }, scheduled: { label: 'Scheduled', tone: 'info' }, expired: { label: 'Expired', tone: 'bad' }, inactive: { label: 'Off', tone: 'gray' } };
/** Placements the customer app really shows today. The others can be created and scheduled but are not displayed yet. */
const SHOWN_IN_APP = new Set(['home_slider', 'popup', 'section']);
const COPY: Record<Group, { title: string; sub: string; places: string[] }> = {
  banners: { title: 'App Banners', sub: 'Manage the sliding banners at the top of the Home screen. (Older category and promo banners stay listed but are not shown in the app.)', places: ['home_slider', 'category', 'promo'] },
  popups: { title: 'Offer Popups', sub: 'A pop-up offer shown once per app session on the Home screen, after it loads. Customers can close it.', places: ['popup'] },
  sections: { title: 'Promotional Sections', sub: 'Highlighted cards shown on the Home screen, below Today’s Offers, while they are active and in schedule (up to 4).', places: ['section'] },
};

type Form = { id?: string; title: string; eyebrow: string; accent: string; cta: string; placement: string; imageUrl: string; targetType: B['targetType']; targetId: string; sortOrder: string; startsAt: string; endsAt: string; isActive: boolean };

export function BannersView({ group }: { group: Group }) {
  const days = useRange();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<List>(`admin/banners${qs({ group, page, pageSize: 10, days })}`);
  const collections = useFetch<{ items: { id: string; name: string }[] }>('admin/collections');
  const [sel, setSel] = useState<B | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [del, setDel] = useState<B | null>(null);
  const [busy, setBusy] = useState(false);
  const c = COPY[group];
  const ctr = data && data.stats.views > 0 ? ((data.stats.clicks / data.stats.views) * 100).toFixed(1) : null;
  const preview = sel ?? data?.items[0] ?? null;

  const open = (b?: B) => { setErrs({}); setF(b ? { id: b.id, title: b.title, eyebrow: b.eyebrow, accent: b.accent ?? '', cta: b.cta, placement: b.placement, imageUrl: b.imageUrl ?? '', targetType: b.targetType, targetId: b.targetId ?? '', sortOrder: String(b.sortOrder), startsAt: toLocalInput(b.startsAt), endsAt: toLocalInput(b.endsAt), isActive: b.isActive } : { title: '', eyebrow: '', accent: '', cta: 'Shop now', placement: c.places[0], imageUrl: '', targetType: 'offers', targetId: '', sortOrder: '0', startsAt: '', endsAt: '', isActive: true }); };
  const save = async () => {
    if (!f || busy) return;
    const e: Record<string, string> = {};
    if (f.title.trim().length < 2) e.title = 'Enter a title';
    if (!f.imageUrl) e.imageUrl = 'Upload an image';
    if (f.targetType !== 'offers' && !f.targetId.trim()) e.targetId = f.targetType === 'collection' ? 'Choose where it opens' : 'Enter the search words';
    if (f.startsAt && f.endsAt && new Date(f.endsAt) <= new Date(f.startsAt)) e.endsAt = 'Must be after the start';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = { title: f.title.trim(), eyebrow: f.eyebrow.trim(), accent: f.accent.trim() || null, cta: f.cta.trim() || 'Shop now', placement: f.placement, imageUrl: f.imageUrl, targetType: f.targetType, targetId: f.targetType === 'offers' ? null : f.targetId.trim(), sortOrder: Number(f.sortOrder || 0), startsAt: toIso(f.startsAt), endsAt: toIso(f.endsAt), isActive: f.isActive };
    try { await api(f.id ? `admin/banners/${f.id}` : 'admin/banners', { method: f.id ? 'PUT' : 'POST', body }); toast(SHOWN_IN_APP.has(f.placement) ? 'Saved. The customer app shows it while it is active and scheduled.' : 'Saved. This placement is not displayed in the customer app yet.'); setF(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };
  const dup = async (b: B) => { try { await api(`admin/banners/${b.id}/duplicate`, { method: 'POST' }); toast('Duplicated (switched off)'); reload(); } catch (x) { toast((x as Error).message, 'bad'); } };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try { await api(`admin/banners/${del.id}`, { method: 'DELETE' }); toast('Deleted'); setDel(null); setSel(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };

  const cols: Col<B>[] = [
    { key: 'b', title: true, header: 'Banner', cell: (b) => <div className="flex items-center gap-3"><Thumb url={b.imageUrl} name={b.title} size={48} /><div className="min-w-0"><p className="font-semibold">{b.title}</p>{b.eyebrow && <p className="truncate text-xs text-ink-muted">{b.eyebrow}</p>}</div></div> },
    { key: 'p', header: 'Placement', cell: (b) => <div className="flex flex-col items-start gap-1"><Badge tone="violet">{PLACE[b.placement]}</Badge>{!SHOWN_IN_APP.has(b.placement) && <Badge tone="gray">Not shown in app yet</Badge>}</div> },
    { key: 's', header: 'Schedule', hideOnMobile: true, cell: (b) => `${b.startsAt ? date(b.startsAt) : 'Now'} – ${b.endsAt ? date(b.endsAt) : 'No end'}` },
    { key: 't', header: 'Status', cell: (b) => <Badge tone={STATE[b.state].tone} dot>{STATE[b.state].label}</Badge> },
    { key: 'perf', header: 'Performance', cell: (b) => <span className="text-sm">{num(b.views)} views<br />{num(b.clicks)} clicks{b.views ? ` (${((b.clicks / b.views) * 100).toFixed(1)}%)` : ''}</span> },
    { key: 'a', header: 'Actions', cell: (b) => (
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" aria-label={`Edit ${b.title}`} onClick={() => open(b)}><Pencil className="h-4 w-4" /></button>
        <button className="icon-btn" aria-label={`Duplicate ${b.title}`} onClick={() => dup(b)}><Copy className="h-4 w-4" /></button>
        <button className="icon-btn icon-btn-bad" aria-label={`Delete ${b.title}`} onClick={() => setDel(b)}><Trash2 className="h-4 w-4" /></button>
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Banner & Campaign Management" subtitle="Create, schedule and manage app banners, festive campaigns and promotional offers." crumbs={['Banners & Campaigns', c.title]} actions={<button className="btn-primary" onClick={() => open()}><Plus className="h-4 w-4" />Create New</button>} />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard icon={<EyeIcon />} label="Banner Views" value={data ? num(data.stats.views) : '—'} change={data?.stats.viewsDelta} />
        <StatCard icon={<MousePointerClick />} label="Banner Clicks" value={data ? num(data.stats.clicks) : '—'} change={data?.stats.clicksDelta} />
        <StatCard icon={<Percent />} label="Click-through rate" value={ctr ? `${ctr}%` : '—'} tone="gold" sub={ctr ? undefined : 'No views yet'} />
        <StatCard icon={<Plus />} label="Campaigns" value={data?.counts.campaigns ?? '—'} tone="ok" />
      </div>
      <p className="mb-4 text-xs text-ink-muted">Views and clicks are reported by the customer app itself. They stay at zero until customers use a version of the app that sends them.</p>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <section className="card overflow-hidden" aria-label={c.title}>
          <div className="p-4"><h2 className="section-title">{c.title}</h2><p className="text-sm text-ink-muted">{c.sub}</p></div>
          <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle={`No ${c.title.toLowerCase()} yet`} emptyHint="Use Create New to add one.">
            {data && <><DataTable rows={data.items} cols={cols} rowKey={(b) => b.id} caption={c.title} onRowClick={setSel} /><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="banners" /></>}
          </Async>
        </section>
        <aside className="card h-fit p-4" aria-label="Live app preview">
          <h2 className="section-title">Live App Preview</h2>
          <p className="mb-3 text-sm text-ink-muted">How the selected banner looks to customers.</p>
          <div className="mx-auto w-[230px] rounded-[28px] border-4 border-ink bg-white p-2 shadow-card">
            <div className="rounded-xl bg-burgundy px-3 py-2 text-center font-serif text-sm font-bold text-white">Shree Hari</div>
            {group === 'popups' ? (
              <div className="relative mt-2 flex h-56 items-center justify-center overflow-hidden rounded-xl bg-black/40 p-3">
                <div className="w-full overflow-hidden rounded-xl bg-white shadow-card">
                  <div className="relative h-20 bg-burgundy-dark">{preview?.imageUrl && <img src={preview.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}<span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] text-white" aria-hidden>×</span></div>
                  <div className="p-2 text-center">{preview ? <><p className="text-[9px] font-semibold uppercase tracking-wide text-gold">{preview.eyebrow}</p><p className="font-serif text-xs font-bold leading-tight text-burgundy">{preview.title}{preview.accent ? <span className="text-gold"> {preview.accent}</span> : null}</p><div className="mt-2 flex gap-1"><span className="flex-1 rounded-full border border-line py-1 text-[9px]">Not now</span><span className="flex-[1.4] rounded-full bg-burgundy py-1 text-[9px] font-bold text-white">{preview.cta}</span></div></> : <p className="text-xs">No popup selected</p>}</div>
                </div>
              </div>
            ) : (
            <>
            <div className="relative mt-2 h-32 overflow-hidden rounded-xl bg-burgundy-dark text-white">
              {preview?.imageUrl && <img src={preview.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
              <div className="relative flex h-full flex-col justify-end bg-gradient-to-t from-black/60 to-transparent p-3">
                {preview ? <><p className="text-[10px] font-semibold uppercase tracking-wide text-gold">{preview.eyebrow}</p><p className="font-serif text-base font-bold leading-tight">{preview.title}{preview.accent ? <span className="text-gold"> {preview.accent}</span> : null}</p><span className="mt-1 w-fit rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-burgundy-dark">{preview.cta}</span></> : <p className="text-sm">No banner selected</p>}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 pb-1 text-center text-[9px] text-ink-muted">{['Sweets', 'Snacks', 'Cakes', 'Offers'].map((x) => <span key={x} className="rounded-lg bg-cream p-2">{x}</span>)}</div>
            </>
            )}
          </div>
        </aside>
      </div>

      <Modal wide persistent locked={busy} open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit banner' : 'Create banner'} footer={<><button className="btn-outline" onClick={() => setF(null)} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Save</button></>}>
        {f && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Banner image" required error={errs.imageUrl}><ImageUpload value={f.imageUrl ? [f.imageUrl] : []} onChange={(u) => setF({ ...f, imageUrl: u[0] ?? '' })} label="Upload banner" /></Field></div>
            <Field label="Title" required error={errs.title}><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} /></Field>
            <Field label="Small heading above title"><input className="input" value={f.eyebrow} onChange={(e) => setF({ ...f, eyebrow: e.target.value })} maxLength={40} /></Field>
            <Field label="Highlighted words"><input className="input" value={f.accent} onChange={(e) => setF({ ...f, accent: e.target.value })} maxLength={40} /></Field>
            <Field label="Button text"><input className="input" value={f.cta} onChange={(e) => setF({ ...f, cta: e.target.value })} maxLength={24} /></Field>
            <Field label="Placement"><select className="input" value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })}>{c.places.filter((p) => SHOWN_IN_APP.has(p) || p === f.placement).map((p) => <option key={p} value={p}>{PLACE[p]}{SHOWN_IN_APP.has(p) ? '' : ' (not shown in app)'}</option>)}</select></Field>
            <Field label="Order" hint="Smaller shows first"><input className="input" inputMode="numeric" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: digitsOnly(e.target.value) })} /></Field>
            <Field label="When tapped"><select className="input" value={f.targetType} onChange={(e) => setF({ ...f, targetType: e.target.value as B['targetType'], targetId: '' })}><option value="offers">Open the Offers page</option><option value="collection">Open a collection</option><option value="search">Search for…</option></select></Field>
            {f.targetType === 'collection' && <Field label="Collection" error={errs.targetId}><select className="input" value={f.targetId} onChange={(e) => setF({ ...f, targetId: e.target.value })}><option value="">Choose…</option>{collections.data?.items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
            {f.targetType === 'search' && <Field label="Search words" error={errs.targetId}><input className="input" value={f.targetId} onChange={(e) => setF({ ...f, targetId: e.target.value })} maxLength={80} /></Field>}
            <Field label="Starts"><input className="input" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
            <Field label="Ends" error={errs.endsAt}><input className="input" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
            <label className="flex min-h-[42px] items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />Active</label>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} danger busy={busy} onClose={() => setDel(null)} onConfirm={remove} title="Delete this banner?" confirmLabel="Delete" message={<p><b>{del?.title}</b> will be removed from the app. Its view and click history stays in reports.</p>} />
    </>
  );
}
