'use client';
import { isValidEmail, isValidStaffPhone } from '@/lib/validate';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { api, useFetch } from '@/lib/api';
import { date } from '@/lib/format';
import { Async, Badge, ConfirmDialog, Field, Modal, PageHeader, Spinner } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';
import { useMe } from '@/components/Shell';

type U = { id: string; name: string; email: string; phone: string; role: 'SUPER_ADMIN' | 'MANAGER'; isBlocked: boolean; createdAt: string };
const ROLE = { SUPER_ADMIN: 'Super Admin', MANAGER: 'Manager' } as const;

export default function Staff() {
  const me = useMe();
  const { data, error, loading, reload } = useFetch<{ items: U[] }>('admin/staff');
  const [f, setF] = useState<{ name: string; email: string; phone: string; role: U['role']; password: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ u: U; kind: 'block' | 'unblock' | 'role' } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!f || busy) return;
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2 || !/\p{L}/u.test(f.name)) e.name = 'Enter a name';
    if (!isValidEmail(f.email)) e.email = 'Enter a valid email, like name@example.com';
    if (!isValidStaffPhone(f.phone)) e.phone = 'Like 98765 43210 or +91 98765 43210';
    if (f.password.length < 10) e.password = 'At least 10 characters';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api('admin/staff', { method: 'POST', body: { ...f, name: f.name.trim(), email: f.email.trim() } }); toast('Account created. Share the password with them securely.'); setF(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };
  const apply = async () => {
    if (!confirm) return;
    setBusy(true);
    const { u, kind } = confirm;
    try { await api(`admin/staff/${u.id}`, { method: 'PATCH', body: kind === 'role' ? { role: u.role === 'MANAGER' ? 'SUPER_ADMIN' : 'MANAGER' } : { isBlocked: kind === 'block' } }); toast('Updated'); setConfirm(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };

  const cols: Col<U>[] = [
    { key: 'n', title: true, header: 'Name', cell: (u) => <div><p className="font-semibold">{u.name}{u.id === me.id && <span className="ml-2 text-xs text-ink-muted">(you)</span>}</p><p className="text-xs text-ink-muted">{u.email}</p></div> },
    { key: 'p', header: 'Phone', hideOnMobile: true, cell: (u) => u.phone },
    { key: 'r', header: 'Role', cell: (u) => <Badge tone={u.role === 'SUPER_ADMIN' ? 'violet' : 'info'}>{ROLE[u.role]}</Badge> },
    { key: 's', header: 'Status', cell: (u) => <Badge tone={u.isBlocked ? 'bad' : 'ok'} dot>{u.isBlocked ? 'Blocked' : 'Active'}</Badge> },
    { key: 'c', header: 'Added', hideOnMobile: true, cell: (u) => date(u.createdAt) },
    { key: 'a', header: 'Actions', cell: (u) => u.id === me.id ? <span className="text-xs text-ink-muted">—</span> : (
      <div className="flex flex-wrap gap-1"><button className="btn-ghost btn-sm !px-2 text-xs" onClick={() => setConfirm({ u, kind: 'role' })}>Make {u.role === 'MANAGER' ? 'Super Admin' : 'Manager'}</button>
        <button className={`btn-ghost btn-sm !px-2 text-xs ${u.isBlocked ? '' : 'text-bad'}`} onClick={() => setConfirm({ u, kind: u.isBlocked ? 'unblock' : 'block' })}>{u.isBlocked ? 'Unblock' : 'Block'}</button></div>) },
  ];

  return (
    <>
      <PageHeader title="Admin Users" subtitle="Who can sign in to this panel. Super admins can do everything; managers run daily operations but cannot manage staff, settings, the audit log or pay refunds." crumbs={['Settings', 'Admin Users']}
        actions={<button className="btn-primary" onClick={() => { setErrs({}); setF({ name: '', email: '', phone: '', role: 'MANAGER', password: '' }); }}><Plus className="h-4 w-4" />Add admin user</button>} />
      <div className="card overflow-hidden">
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload}>{data && <DataTable rows={data.items} cols={cols} rowKey={(u) => u.id} caption="Admin users" />}</Async>
      </div>
      <Modal persistent locked={busy} open={!!f} onClose={() => setF(null)} title="Add admin user" footer={<><button className="btn-outline" onClick={() => setF(null)} disabled={busy}>Cancel</button><button className="btn-primary" onClick={create} disabled={busy}>{busy && <Spinner />}Create account</button></>}>
        {f && (
          <div className="space-y-4">
            <Field label="Full name" required error={errs.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} /></Field>
            <Field label="Email" required error={errs.email}><input className="input" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Mobile" required error={errs.phone}><input className="input" type="tel" inputMode="tel" autoComplete="off" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d+]/g, '') })} placeholder="+919876543210" /></Field>
            <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as U['role'] })}><option value="MANAGER">Manager</option><option value="SUPER_ADMIN">Super Admin</option></select></Field>
            <Field label="Temporary password" required error={errs.password} hint="At least 10 characters. Ask them to change it after signing in."><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!confirm} danger={confirm?.kind === 'block'} busy={busy} onClose={() => setConfirm(null)} onConfirm={apply} title={confirm?.kind === 'role' ? 'Change role?' : confirm?.kind === 'block' ? 'Block this user?' : 'Unblock this user?'} confirmLabel="Confirm"
        message={<p>{confirm?.kind === 'role' ? <>Make <b>{confirm.u.name}</b> a {confirm.u.role === 'MANAGER' ? 'Super Admin (full access)' : 'Manager (limited access)'}?</> : confirm?.kind === 'block' ? <><b>{confirm?.u.name}</b> will be signed out and cannot sign in.</> : <><b>{confirm?.u.name}</b> will be able to sign in again.</>}</p>} />
    </>
  );
}
