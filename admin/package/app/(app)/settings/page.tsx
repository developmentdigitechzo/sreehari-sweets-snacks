'use client';
import { isValidContactPhone, isValidEmail } from '@/lib/validate';
import { useEffect, useState } from 'react';
import { api, useFetch } from '@/lib/api';
import { digitsOnly } from '@/lib/format';
import { Async, Field, PageHeader, Spinner } from '@/components/ui/kit';
import { SystemCheck } from '@/components/SystemCheck';
import { toast } from '@/components/ui/Toast';

type S = { storeName: string; contactPhone: string; contactEmail: string; address: string; lowStockThreshold: number; returnWindowDays: number };

export default function Settings() {
  const { data, error, loading, reload } = useFetch<S>('admin/settings');
  const [f, setF] = useState({ storeName: '', contactPhone: '', contactEmail: '', address: '', lowStockThreshold: '', returnWindowDays: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF({ ...data, lowStockThreshold: String(data.lowStockThreshold), returnWindowDays: String(data.returnWindowDays) }); }, [data]);

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const e: Record<string, string> = {};
    if (f.storeName.trim().length < 2) e.storeName = 'Enter the store name';
    if (f.contactEmail && !isValidEmail(f.contactEmail)) e.contactEmail = 'Enter a valid email, like name@example.com';
    if (!isValidContactPhone(f.contactPhone)) e.contactPhone = 'Enter a valid phone number (7 to 15 digits)';
    if (!/^\d+$/.test(f.lowStockThreshold)) e.lowStockThreshold = 'Whole number';
    if (!/^\d+$/.test(f.returnWindowDays) || Number(f.returnWindowDays) > 60) e.returnWindowDays = '0–60 days';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api('admin/settings', { method: 'PUT', body: { ...f, storeName: f.storeName.trim(), lowStockThreshold: Number(f.lowStockThreshold), returnWindowDays: Number(f.returnWindowDays) } }); toast('Settings saved'); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };
  return (
    <>
      <PageHeader title="Business Settings" subtitle="Store details and the rules the panel and customer app use." crumbs={['Settings', 'Business']} />
      <Async loading={loading} error={error} hasData={!!data} onRetry={reload}>
        <form onSubmit={save} noValidate className="card max-w-3xl space-y-4 p-4 sm:p-5">
          <Field label="Store name" required error={errs.storeName}><input className="input" value={f.storeName} onChange={(e) => setF({ ...f, storeName: e.target.value })} maxLength={80} /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Contact phone"><input className="input" type="tel" inputMode="tel" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value.replace(/[^\d+\s-]/g, '') })} maxLength={20} /></Field>
            <Field label="Contact email" error={errs.contactEmail}><input className="input" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} maxLength={120} /></Field>
          </div>
          <Field label="Store address"><textarea className="input min-h-[80px] py-2" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={300} /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Low-stock alert at or below" error={errs.lowStockThreshold} hint="Used for the Low Stock tabs, dashboard alert and reports"><input className="input" inputMode="numeric" value={f.lowStockThreshold} onChange={(e) => setF({ ...f, lowStockThreshold: digitsOnly(e.target.value) })} /></Field>
            <Field label="Return window (days after delivery)" error={errs.returnWindowDays} hint="Customers can request a return within this time"><input className="input" inputMode="numeric" value={f.returnWindowDays} onChange={(e) => setF({ ...f, returnWindowDays: digitsOnly(e.target.value) })} /></Field>
          </div>
          <button className="btn-primary" type="submit" disabled={busy}>{busy && <Spinner />}Save settings</button>
          <p className="text-xs text-ink-muted">Delivery charges and COD limit are on the Delivery page.</p>
        </form>
      </Async>
      <SystemCheck />
    </>
  );
}
