'use client';
import { Eye, EyeOff, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, useFetch } from '@/lib/api';
import { digitsOnly } from '@/lib/format';
import { Async, Badge, ConfirmDialog, Field, Modal, PageHeader, Spinner } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Thumb } from '@/components/ui/Thumb';
import { toast } from '@/components/ui/Toast';

type Cat = { id: string; name: string; parentId: string | null; imageUrl: string | null; thumbUrl?: string | null; sortOrder: number; isActive: boolean; products: number };
/** The form keeps the display order as text so the field can be emptied while typing. */
type Draft = Partial<Omit<Cat, 'sortOrder'>> & { sortOrder?: number | string };

export default function Categories() {
  const { data, error, loading, reload } = useFetch<{ items: Cat[] }>('admin/categories');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [del, setDel] = useState<Cat | null>(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const rows = (() => {
    const all = data?.items ?? [];
    const out: (Cat & { depth: number })[] = [];
    const walk = (parent: string | null, depth: number) => all.filter((c) => c.parentId === parent).forEach((c) => { out.push({ ...c, depth }); walk(c.id, depth + 1); });
    walk(null, 0);
    return out;
  })();

  const save = async () => {
    if (!edit || busy) return;
    const e: Record<string, string> = {};
    if (!edit.name || edit.name.trim().length < 2) e.name = 'Enter a name (2+ characters)';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = { name: edit.name!.trim(), parentId: edit.parentId || null, imageUrl: edit.imageUrl || null, sortOrder: Number(edit.sortOrder || 0), isActive: edit.isActive ?? true };
      await api(edit.id ? `admin/categories/${edit.id}` : 'admin/categories', { method: edit.id ? 'PUT' : 'POST', body });
      toast('Category saved'); setEdit(null); reload();
    } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try { await api(`admin/categories/${del.id}`, { method: 'DELETE' }); toast('Category deleted'); setDel(null); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
    setBusy(false);
  };
  const toggle = async (c: Cat) => {
    try { await api(`admin/categories/${c.id}`, { method: 'PUT', body: { name: c.name, parentId: c.parentId, imageUrl: c.imageUrl, sortOrder: c.sortOrder, isActive: !c.isActive } }); toast(`${c.name} ${c.isActive ? 'hidden from' : 'shown in'} the app`); reload(); } catch (x) { toast((x as Error).message, 'bad'); }
  };

  const cols: Col<Cat & { depth: number }>[] = [
    { key: 'n', title: true, header: 'Category', cell: (c) => <div className="flex items-center gap-3" style={{ paddingLeft: c.depth * 20 }}><Thumb url={c.thumbUrl ?? c.imageUrl} name={c.name} size={36} /><span className="font-semibold">{c.name}</span></div> },
    { key: 'p', header: 'Products', cell: (c) => c.products },
    { key: 'o', header: 'Order', cell: (c) => c.sortOrder },
    { key: 's', header: 'Visibility', cell: (c) => <Badge tone={c.isActive ? 'ok' : 'gray'} dot>{c.isActive ? 'Visible' : 'Hidden'}</Badge> },
    { key: 'a', header: 'Actions', cell: (c) => (
      <div className="flex gap-1">
        <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => { setErrs({}); setEdit(c); }}><Pencil className="h-4 w-4" /></button>
        <button className="icon-btn" aria-label={c.isActive ? `Hide ${c.name}` : `Show ${c.name}`} onClick={() => toggle(c)}>{c.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
        <button className="icon-btn icon-btn-bad" aria-label={`Delete ${c.name}`} onClick={() => setDel(c)}><Trash2 className="h-4 w-4" /></button>
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Categories" subtitle="Organise products into categories and subcategories, set their order and show or hide them in the app." crumbs={['Products', 'Categories']}
        actions={<><Link href="/products/import?type=categories" className="btn-outline"><Upload className="h-4 w-4" />Import CSV</Link><button className="btn-primary" onClick={() => { setErrs({}); setEdit({ isActive: true, sortOrder: 0 }); }}><Plus className="h-4 w-4" />Add category</button></>} />
      <div className="card overflow-hidden">
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={rows.length === 0} emptyTitle="No categories yet">
          <DataTable rows={rows} cols={cols} rowKey={(c) => c.id} caption="Categories" />
        </Async>
      </div>
      <Modal persistent locked={busy} open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit category' : 'Add category'} footer={<><button className="btn-outline" onClick={() => setEdit(null)} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />}Save</button></>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Name" required error={errs.name}><input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} /></Field>
            <Field label="Parent category" hint="Leave empty for a top-level category">
              <select className="input" value={edit.parentId ?? ''} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })}>
                <option value="">None (top level)</option>
                {data?.items.filter((c) => c.id !== edit.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Display order" hint="Smaller numbers show first"><input className="input" inputMode="numeric" value={edit.sortOrder ?? ''} placeholder="0" onChange={(e) => setEdit({ ...edit, sortOrder: digitsOnly(e.target.value) })} /></Field>
            <Field label="Image"><ImageUpload value={edit.imageUrl ? [edit.imageUrl] : []} onChange={(u) => setEdit({ ...edit, imageUrl: u[0] ?? null })} /></Field>
            <label className="flex min-h-[42px] items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive ?? true} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Visible in the customer app</label>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} danger busy={busy} onClose={() => setDel(null)} onConfirm={remove} title="Delete category?" confirmLabel="Delete"
        message={<p><b>{del?.name}</b> will be deleted. Only empty categories can be deleted; otherwise hide it instead.</p>} />
    </>
  );
}
