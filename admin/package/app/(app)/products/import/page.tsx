'use client';
import { CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, ConfirmDialog, PageHeader, Spinner, StatCard, Tabs } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { toast } from '@/components/ui/Toast';

type Kind = 'products' | 'categories';
type Row = { line: number; name: string; status: 'ok' | 'skip' | 'error'; message: string };
type Result = { committed: boolean; summary: { total: number; ready: number; skipped: number; errors: number; created: number }; rows: Row[] };

const MAX_BYTES = 2_000_000;

const HELP: Record<Kind, { noun: string; columns: { name: string; note: string; required?: boolean }[]; tips: string[] }> = {
  products: {
    noun: 'products',
    columns: [
      { name: 'name', note: 'Product name. Repeat the same name on several rows to add several sizes.', required: true },
      { name: 'category', note: 'An existing category, for example Kaju Sweets. Use "Sweets > Kaju Sweets" if two share a name.', required: true },
      { name: 'price', note: 'Selling price in rupees.', required: true },
      { name: 'size', note: 'Pack size such as 250 g. Blank becomes "Standard".' },
      { name: 'mrp', note: 'Blank means the same as price. Price can never be above MRP.' },
      { name: 'stock', note: 'Opening stock for that size (whole number). Blank means 0.' },
      { name: 'sku', note: 'Blank creates one for you.' },
      { name: 'tagline, description, tags, image_url', note: 'Optional. Separate tags with ;  Images must be https links.' },
      { name: 'bestseller, new_arrival, festive, active', note: 'yes or no. Products are published (active) unless you say no.' },
    ],
    tips: ['Add the categories first (Categories tab), then the products.', 'Products that already exist (same name) are skipped, never changed.'],
  },
  categories: {
    noun: 'categories',
    columns: [
      { name: 'name', note: 'Category name.', required: true },
      { name: 'parent', note: 'Name of the parent category (existing, or another row in this file). Blank for a top-level category.' },
      { name: 'sort_order', note: 'Smaller numbers show first. Blank means 0.' },
      { name: 'active', note: 'yes or no. Blank means yes.' },
    ],
    tips: ['Parents and children can be in any order in the file.', 'Categories that already exist are skipped, never changed.'],
  },
};

function Import() {
  const params = useSearchParams();
  const [kind, setKind] = useState<Kind>(params.get('type') === 'categories' ? 'categories' : 'products');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [fileError, setFileError] = useState('');
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const help = HELP[kind];
  const noun = (n: number) => (n === 1 ? help.noun.replace(/ies$/, 'y').replace(/s$/, '') : help.noun);

  const reset = () => { setFileName(''); setCsv(''); setResult(null); setFileError(''); if (input.current) input.current.value = ''; };

  const download = async () => {
    try {
      const text = await api<string>(`admin/import/template?type=${kind}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
      a.download = `${kind}-template.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast((e as Error).message, 'bad'); }
  };

  const check = async (text: string) => {
    setChecking(true); setFileError(''); setResult(null);
    try {
      setResult(await api<Result>(`admin/import/${kind}`, { method: 'POST', body: { csv: text, commit: false } }));
    } catch (e) { setFileError((e as Error).message); }
    setChecking(false);
  };

  const pick = async (file: File | undefined) => {
    reset();
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) { setFileError('Excel files are not read directly. In Excel choose File > Save As > "CSV UTF-8", then upload that file.'); return; }
    if (file.size > MAX_BYTES) { setFileError('The file is over 2 MB. Split it into smaller files.'); return; }
    const text = await file.text();
    setFileName(file.name); setCsv(text);
    await check(text);
  };

  const commit = async () => {
    setBusy(true);
    try {
      const r = await api<Result>(`admin/import/${kind}`, { method: 'POST', body: { csv, commit: true } });
      setResult(r); setConfirm(false);
      toast(`${r.summary.created} ${help.noun} imported`);
    } catch (e) { toast((e as Error).message, 'bad'); setConfirm(false); }
    setBusy(false);
  };

  const tone = { ok: 'ok', skip: 'gray', error: 'bad' } as const;
  const label = (r: Row) => (r.status === 'ok' ? (result?.committed ? 'Imported' : 'Ready') : r.status === 'skip' ? 'Skipped' : 'Error');
  const rows = result ? (onlyIssues ? result.rows.filter((r) => r.status !== 'ok') : result.rows) : [];
  const cols: Col<Row>[] = [
    { key: 'l', header: 'Line', cell: (r) => r.line, className: 'w-16' },
    { key: 'n', title: true, header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 's', header: 'Result', cell: (r) => <Badge tone={tone[r.status]} dot>{label(r)}</Badge> },
    { key: 'm', header: 'Details', cell: (r) => <span className="text-sm text-ink-muted">{r.message || '—'}</span> },
  ];
  const s = result?.summary;
  const done = !!result?.committed;

  return (
    <>
      <PageHeader title="Import from CSV" subtitle="Add many categories or products at once from a spreadsheet saved as CSV. You see a preview first; nothing is saved until you confirm."
        crumbs={['Products', 'Import']} actions={<Link href="/products" className="btn-outline">Back to products</Link>} />
      <Tabs value={kind} onChange={(v) => { setKind(v); reset(); }} tabs={[{ id: 'products', label: 'Products' }, { id: 'categories', label: 'Categories' }]} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.4fr]">
        <section className="card space-y-4 p-4 sm:p-5" aria-label="How to prepare the file">
          <h2 className="section-title">1. Prepare your file</h2>
          <button className="btn-outline" onClick={download}><Download className="h-4 w-4" />Download {help.noun} template</button>
          <p className="text-sm text-ink-muted">Open the template in Excel or Google Sheets, fill in your rows, then save as <b>CSV (UTF-8)</b>. Keep the first row (the column names).</p>
          <ul className="space-y-2 text-sm">
            {help.columns.map((c) => (
              <li key={c.name}><code className="rounded bg-cream-deep px-1.5 py-0.5 text-xs">{c.name}</code>{c.required && <span className="ml-1 text-xs font-semibold text-bad">required</span>}<span className="block text-ink-muted">{c.note}</span></li>
            ))}
          </ul>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">{help.tips.map((t) => <li key={t}>{t}</li>)}<li>Up to 1,000 rows and 2 MB per file.</li></ul>
        </section>

        <section className="space-y-5">
          <div className="card space-y-4 p-4 sm:p-5">
            <h2 className="section-title">2. Upload and check</h2>
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-cream/50 p-8 text-center hover:border-burgundy focus-within:border-burgundy"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}>
              <Upload className="h-8 w-8 text-burgundy" aria-hidden />
              <span className="font-semibold">{fileName ? 'Choose a different file' : 'Choose a CSV file or drop it here'}</span>
              <span className="text-xs text-ink-muted">.csv, up to 2 MB</span>
              <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
            {fileName && <p className="flex items-center gap-2 text-sm"><FileSpreadsheet className="h-4 w-4 text-burgundy" aria-hidden /><b className="truncate">{fileName}</b>{checking && <><Spinner /><span className="text-ink-muted">Checking…</span></>}</p>}
            {fileError && <p role="alert" className="rounded-lg border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{fileError}</p>}
          </div>

          {result && s && (
            <div className="card overflow-hidden">
              <div className="space-y-4 border-b border-line p-4 sm:p-5">
                <h2 className="section-title">{done ? '3. Result' : '3. Review'}</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCard icon={<FileSpreadsheet />} label={done ? 'In file' : 'In file'} value={s.total} />
                  <StatCard icon={<CheckCircle2 />} label={done ? 'Imported' : 'Ready to import'} value={done ? s.created : s.ready} tone="gold" />
                  <StatCard icon={<RotateCcw />} label="Already exist (skipped)" value={s.skipped} />
                  <StatCard icon={<FileSpreadsheet />} label="Need fixing" value={s.errors} tone={s.errors ? 'bad' : 'burgundy'} />
                </div>
                {!done && s.errors > 0 && <p className="text-sm text-ink-muted">Rows with errors will not be imported. Fix them in your file and upload it again, or import the ready rows now and add the rest later.</p>}
                <div className="flex flex-wrap items-center gap-3">
                  {done ? (
                    <>
                      <Link href={kind === 'products' ? '/products' : '/products/categories'} className="btn-primary">View {help.noun}</Link>
                      <button className="btn-outline" onClick={reset}>Import another file</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-primary" disabled={s.ready === 0 || checking} onClick={() => setConfirm(true)}>Import {s.ready} {noun(s.ready)}</button>
                      <button className="btn-outline" onClick={reset}>Start over</button>
                    </>
                  )}
                  {s.skipped + s.errors > 0 && <label className="flex min-h-[42px] items-center gap-2 text-sm"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />Show only rows that need attention</label>}
                </div>
              </div>
              {rows.length === 0 ? <p className="p-6 text-sm text-ink-muted">Nothing to show.</p> : <DataTable rows={rows} cols={cols} rowKey={(r) => `${r.line}-${r.name}`} caption={`Import ${help.noun} preview`} />}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog open={confirm} busy={busy} onClose={() => setConfirm(false)} onConfirm={commit} title={`Import ${s?.ready ?? 0} ${noun(s?.ready ?? 0)}?`} confirmLabel="Import"
        message={<p>{s?.ready} new {noun(s?.ready ?? 0)} will be added{kind === 'products' ? ' and shown in the customer app straight away (unless a row says active = no)' : ''}. Existing ones are not changed. To undo it, archive each imported product or hide each category.</p>} />
    </>
  );
}

export default function ImportPage() {
  return <Suspense><Import /></Suspense>;
}
