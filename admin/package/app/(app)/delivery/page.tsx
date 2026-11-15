'use client';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useFetch } from '@/lib/api';
import { digitsOnly } from '@/lib/format';
import { Async, ConfirmDialog, Field, PageHeader, Spinner } from '@/components/ui/kit';
import { toast } from '@/components/ui/Toast';

type Slot = { id: string; title: string; window: string; start: string; end: string; kind: string; defaultFee: number; fee: string; enabled: boolean };
type ApiSlot = Omit<Slot, 'fee'> & { fee: number };
type D = { freeDeliveryThreshold: number; codLimit: number; maxAdvanceDays: number; cutoffMinutes: number; slots: ApiSlot[]; pincodes: { pincode: string; isActive: boolean }[] };

export default function Delivery() {
  const { data, error, loading, reload } = useFetch<D>('admin/delivery');
  const [thr, setThr] = useState('');
  const [cod, setCod] = useState('');
  const [days, setDays] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [del, setDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setThr(String(data.freeDeliveryThreshold)); setCod(String(data.codLimit)); setDays(String(data.maxAdvanceDays)); setCutoff(String(data.cutoffMinutes)); setSlots(data.slots.map((s) => ({ ...s, fee: String(s.fee) }))); } }, [data]);

  const save = async () => {
    if (busy) return;
    const e: Record<string, string> = {};
    if (!/^\d+$/.test(thr)) e.thr = 'Whole rupees';
    if (!/^\d+$/.test(cod)) e.cod = 'Whole rupees';
    if (!/^\d+$/.test(days) || Number(days) > 14) e.days = '0 to 14';
    if (!/^\d+$/.test(cutoff) || Number(cutoff) > 720) e.cutoff = '0 to 720 minutes';
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    slots.forEach((s) => {
      if (!/^\d+$/.test(s.fee)) e[s.id] = 'Whole rupees';
      if (!s.title.trim()) e[`${s.id}-title`] = 'Required';
      if (!s.window.trim()) e[`${s.id}-window`] = 'Required';
      if (s.kind !== 'express') {
        if (!hhmm.test(s.start)) e[`${s.id}-start`] = 'Like 13:00';
        if (!hhmm.test(s.end)) e[`${s.id}-end`] = 'Like 15:00';
        else if (hhmm.test(s.start) && s.end <= s.start) e[`${s.id}-end`] = 'After the start';
      }
    });
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api('admin/delivery', { method: 'PUT', body: { freeDeliveryThreshold: Number(thr), codLimit: Number(cod), maxAdvanceDays: Number(days), cutoffMinutes: Number(cutoff), slots: Object.fromEntries(slots.map((s) => [s.id, { fee: Number(s.fee), enabled: s.enabled, title: s.title.trim(), window: s.window.trim(), ...(s.kind !== 'express' ? { start: s.start, end: s.end } : {}) }])) } }); toast('Delivery settings saved. New orders use them straight away.'); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };
  const add = async () => {
    if (busy) return;
    if (!/^[1-9]\d{5}$/.test(pin)) { setPinErr('Enter a 6-digit PIN code'); return; }
    setBusy(true);
    try { await api('admin/delivery/pincodes', { method: 'POST', body: { pincode: pin } }); setPin(''); setPinErr(''); toast('PIN code added'); reload(); } catch (x) { setPinErr((x as Error).message); }
    setBusy(false);
  };
  const toggle = async (p: string, isActive: boolean) => { try { await api(`admin/delivery/pincodes/${p}`, { method: 'PATCH', body: { isActive } }); reload(); } catch (x) { toast((x as Error).message, 'bad'); } };
  const remove = async () => { if (!del) return; setBusy(true); try { await api(`admin/delivery/pincodes/${del}`, { method: 'DELETE' }); toast('PIN code removed'); setDel(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); } setBusy(false); };

  return (
    <>
      <PageHeader title="Delivery" subtitle="Delivery charges, free-delivery limit, Cash on Delivery limit, time slots and serviceable PIN codes." crumbs={['Delivery']} />
      <Async loading={loading} error={error} hasData={!!data} onRetry={reload}>
        {data && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className="card space-y-4 p-4 sm:p-5">
              <h2 className="section-title">Charges and limits</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Free delivery above (₹)" error={errs.thr} hint="Orders with items worth at least this much ship free"><input className="input" inputMode="numeric" value={thr} onChange={(e) => setThr(digitsOnly(e.target.value))} /></Field>
                <Field label="Cash on Delivery limit (₹)" error={errs.cod} hint="Larger orders must be paid online"><input className="input" inputMode="numeric" value={cod} onChange={(e) => setCod(digitsOnly(e.target.value))} /></Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Schedule ahead (days)" error={errs.days} hint="How many days ahead a customer may pick a delivery date. 0 = today only"><input className="input" inputMode="numeric" value={days} onChange={(e) => setDays(digitsOnly(e.target.value))} /></Field>
                <Field label="Close slot before start (minutes)" error={errs.cutoff} hint="For today, a slot stops taking orders this long before it starts"><input className="input" inputMode="numeric" value={cutoff} onChange={(e) => setCutoff(digitsOnly(e.target.value))} /></Field>
              </div>
              <h3 className="font-semibold">Delivery slots</h3>
              <ul className="space-y-2">
                {slots.map((s, i) => (
                  <li key={s.id} className="space-y-3 rounded-xl border border-line p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Name" error={errs[`${s.id}-title`]}><input className="input" maxLength={24} value={s.title} onChange={(e) => setSlots((x) => x.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} /></Field>
                      <Field label="Text shown to customers" error={errs[`${s.id}-window`]} hint={s.kind === 'express' ? 'For example 30 – 45 mins' : 'For example 1:00 PM - 3:00 PM'}><input className="input" maxLength={30} value={s.window} onChange={(e) => setSlots((x) => x.map((y, j) => (j === i ? { ...y, window: e.target.value } : y)))} /></Field>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      {s.kind !== 'express' ? (<>
                        <Field label="Starts (24 h)" error={errs[`${s.id}-start`]}><input className="input w-28" placeholder="13:00" maxLength={5} value={s.start} onChange={(e) => setSlots((x) => x.map((y, j) => (j === i ? { ...y, start: e.target.value } : y)))} /></Field>
                        <Field label="Ends (24 h)" error={errs[`${s.id}-end`]}><input className="input w-28" placeholder="15:00" maxLength={5} value={s.end} onChange={(e) => setSlots((x) => x.map((y, j) => (j === i ? { ...y, end: e.target.value } : y)))} /></Field>
                      </>) : <p className="max-w-[220px] pb-2 text-xs text-ink-muted">Express is “as soon as possible” and is offered for today only.</p>}
                      <Field label="Fee (₹)" error={errs[s.id]}><input className="input w-24" inputMode="numeric" value={s.fee} onChange={(e) => setSlots((x) => x.map((y, j) => (j === i ? { ...y, fee: digitsOnly(e.target.value) } : y)))} /></Field>
                      <label className="flex min-h-[42px] items-center gap-2 text-sm"><input type="checkbox" checked={s.enabled} onChange={(e) => setSlots((x) => x.map((y, j) => (j === i ? { ...y, enabled: e.target.checked } : y)))} />Offered</label>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-ink-muted">Times are India time. The three slots are fixed, but their names, times and fees are yours to change. Customers see the new wording straight away.</p>
              <button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Save delivery settings</button>
            </section>
            <section className="card space-y-4 p-4 sm:p-5">
              <h2 className="section-title">Serviceable PIN codes</h2>
              <div className="flex gap-2"><div className="flex-1"><input className="input" inputMode="numeric" maxLength={6} placeholder="600040" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinErr(''); }} aria-label="New PIN code" aria-invalid={!!pinErr} />{pinErr && <p className="mt-1 text-xs font-medium text-bad" role="alert">{pinErr}</p>}</div><button className="btn-outline" onClick={add} disabled={busy}><Plus className="h-4 w-4" />Add</button></div>
              {data.pincodes.length === 0 ? <p className="text-sm text-ink-muted">No PIN codes yet, so nobody can order.</p> : (
                <ul className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
                  {data.pincodes.map((p) => (
                    <li key={p.pincode} className="flex items-center justify-between rounded-xl border border-line px-3 py-2"><span className="font-semibold">{p.pincode}</span>
                      <span className="flex items-center gap-1"><button className={`rounded-full px-2 py-1 text-xs font-semibold ${p.isActive ? 'bg-ok-soft text-ok' : 'bg-cream-deep text-ink-muted'}`} onClick={() => toggle(p.pincode, !p.isActive)} aria-label={`${p.pincode} is ${p.isActive ? 'serviceable, tap to disable' : 'disabled, tap to enable'}`}>{p.isActive ? 'Serviceable' : 'Off'}</button>
                        <button className="icon-btn icon-btn-bad" aria-label={`Remove ${p.pincode}`} onClick={() => setDel(p.pincode)}><Trash2 className="h-4 w-4" /></button></span></li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-muted">Customers outside these PIN codes are told delivery is not available.</p>
            </section>
          </div>
        )}
      </Async>
      <ConfirmDialog open={!!del} danger busy={busy} onClose={() => setDel(null)} onConfirm={remove} title="Remove PIN code?" confirmLabel="Remove" message={<p>Customers in <b>{del}</b> will no longer be able to order.</p>} />
    </>
  );
}
