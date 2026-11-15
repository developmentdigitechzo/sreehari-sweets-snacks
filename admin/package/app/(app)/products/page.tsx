'use client';
import { AlertTriangle, Archive, Copy, Eye, EyeOff, Package, PackageX, Pencil, Plus, RotateCcw, Layers, PauseCircle, Upload } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { api, qs, useFetch } from '@/lib/api';
import { rupee } from '@/lib/format';
import { Async, Badge, ConfirmDialog, PageHeader, Pagination, SearchInput, Select, StatCard, Tabs } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { Thumb } from '@/components/ui/Thumb';
import { toast } from '@/components/ui/Toast';

export type ProductRow = {
  id: string; name: string; sku: string; category: string; categoryId: string; status: 'active' | 'inactive' | 'archived'; stockStatus: 'ok' | 'low' | 'out';
  variants: { id: string; label: string; price: number; stock: number }[]; priceMin: number; priceMax: number; totalStock: number; image: string | null; thumbUrl?: string | null; isActive: boolean;
};
type List = { items: ProductRow[]; total: number; page: number; pageSize: number; pages: number; counts: { total: number; active: number; inactive: number; low: number; out: number; archived: number } };
type Cat = { items: { id: string; name: string; parentId: string | null }[] };

export default function ProductsPage() {
  const [status, setStatus] = useState<'all' | 'active' | 'inactive' | 'low' | 'out' | 'archived'>('all');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { data, error, loading, reload } = useFetch<List>(`admin/products${qs({ status, q, categoryId, sort, page, pageSize })}`);
  const cats = useFetch<Cat>('admin/categories');
  const [confirm, setConfirm] = useState<{ row: ProductRow; kind: 'archive' | 'restore' } | null>(null);
  const [busy, setBusy] = useState(false);
  const setQ_ = useCallback((v: string) => { setQ(v); setPage(1); }, []);

  const act = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api(`admin/products/${confirm.row.id}/${confirm.kind}`, { method: 'POST' });
      toast(confirm.kind === 'archive' ? `${confirm.row.name} archived` : `${confirm.row.name} restored (still unpublished)`);
      setConfirm(null);
      reload();
    } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };
  const togglePublish = async (r: ProductRow) => {
    try { await api(`admin/products/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } }); toast(`${r.name} ${r.isActive ? 'unpublished' : 'published'}`); reload(); } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const duplicate = async (r: ProductRow) => {
    try { await api(`admin/products/${r.id}/duplicate`, { method: 'POST' }); toast('Duplicated as an unpublished copy with zero stock'); reload(); } catch (e) { toast((e as Error).message, 'bad'); }
  };

  const cols: Col<ProductRow>[] = [
    { key: 'p', title: true, header: 'Product', cell: (r) => <div className="flex items-center gap-3"><Thumb url={r.thumbUrl ?? r.image} name={r.name} size={44} /><div className="min-w-0"><p className="truncate font-semibold">{r.name}</p><p className="truncate text-xs text-ink-muted">SKU: {r.sku}</p></div></div> },
    { key: 'c', header: 'Category', cell: (r) => <Badge tone="gold">{r.category}</Badge> },
    { key: 'v', header: 'Sizes', hideOnMobile: true, cell: (r) => <div className="flex flex-wrap gap-1">{r.variants.map((v) => <span key={v.id} className="rounded-full border border-line px-2 py-0.5 text-xs">{v.label}</span>)}</div> },
    { key: 'pr', header: 'Price', cell: (r) => (r.priceMin === r.priceMax ? rupee(r.priceMin) : `${rupee(r.priceMin)} – ${rupee(r.priceMax)}`) },
    { key: 's', header: 'Stock', cell: (r) => r.totalStock },
    { key: 'st', header: 'Status', cell: (r) => r.status === 'archived' ? <Badge tone="gray" dot>Archived</Badge> : r.status === 'inactive' ? <Badge tone="gray" dot>Unpublished</Badge> : r.stockStatus === 'out' ? <Badge tone="bad" dot>Out of Stock</Badge> : r.stockStatus === 'low' ? <Badge tone="warn" dot>Low Stock</Badge> : <Badge tone="ok" dot>Active</Badge> },
    {
      key: 'a', header: 'Actions', cell: (r) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {r.status !== 'archived' ? (<>
            <Link href={`/products/${r.id}`} className="icon-btn" aria-label={`Edit ${r.name}`}><Pencil className="h-4 w-4" /></Link>
            <button onClick={() => duplicate(r)} className="icon-btn" aria-label={`Duplicate ${r.name}`}><Copy className="h-4 w-4" /></button>
            <button onClick={() => togglePublish(r)} className="icon-btn" aria-label={r.isActive ? `Unpublish ${r.name}` : `Publish ${r.name}`}>{r.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
            <button onClick={() => setConfirm({ row: r, kind: 'archive' })} className="icon-btn icon-btn-bad" aria-label={`Archive ${r.name}`}><Archive className="h-4 w-4" /></button>
          </>) : <button onClick={() => setConfirm({ row: r, kind: 'restore' })} className="btn-outline btn-sm"><RotateCcw className="h-4 w-4" />Restore</button>}
        </div>
      ),
    },
  ];
  const c = data?.counts;

  return (
    <>
      <PageHeader title="Product Management" subtitle="Add, edit and manage your products, prices, inventory and availability." crumbs={['Products']}
        actions={<><Link href="/products/import" className="btn-outline"><Upload className="h-4 w-4" />Import CSV</Link><Link href="/products/new" className="btn-primary"><Plus className="h-4 w-4" />Add New Product</Link></>} />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard icon={<Package />} label="Total Products" value={c?.total ?? '—'} />
        <StatCard icon={<Layers />} label="Active Products" value={c?.active ?? '—'} tone="ok" />
        <StatCard icon={<PauseCircle />} label="Inactive Products" value={c?.inactive ?? '—'} />
        <StatCard icon={<AlertTriangle />} label="Low Stock" value={c?.low ?? '—'} tone="warn" />
        <StatCard icon={<PackageX />} label="Out of Stock" value={c?.out ?? '—'} tone="bad" />
      </div>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[
        { id: 'all', label: 'All Products', count: c?.total }, { id: 'active', label: 'Active', count: c?.active }, { id: 'inactive', label: 'Inactive', count: c?.inactive },
        { id: 'low', label: 'Low Stock', count: c?.low }, { id: 'out', label: 'Out of Stock', count: c?.out }, { id: 'archived', label: 'Archived', count: c?.archived },
      ]} />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={setQ_} placeholder="Search products by name, SKU or category…" />
          <Select label="Category" value={categoryId} onChange={(v) => { setCategoryId(v); setPage(1); }} options={[{ value: 'all', label: 'All Categories' }, ...(cats.data?.items ?? []).map((x) => ({ value: x.id, label: x.parentId ? `— ${x.name}` : x.name }))]} />
          <Select label="Sort by" value={sort} onChange={(v) => { setSort(v); setPage(1); }}options={[{ value: 'newest', label: 'Sort By: Newest' }, { value: 'name', label: 'Name (A–Z)' }, { value: 'stock', label: 'Stock' }, { value: 'price', label: 'Price' }]} />
        </div>
        <Async loading={loading} error={error} hasData={!!data} onRetry={reload} empty={data?.total === 0} emptyTitle="No products match" emptyHint="Try a different filter, or add a new product.">
          {data && <>
            <DataTable rows={data.items} cols={cols} rowKey={(r) => r.id} caption="Products" />
            <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="products" />
          </>}
        </Async>
      </div>
      <ConfirmDialog open={!!confirm} danger={confirm?.kind === 'archive'} busy={busy} onClose={() => setConfirm(null)} onConfirm={act}
        title={confirm?.kind === 'archive' ? 'Archive this product?' : 'Restore this product?'} confirmLabel={confirm?.kind === 'archive' ? 'Archive' : 'Restore'}
        message={confirm?.kind === 'archive' ? <p><b>{confirm.row.name}</b> will disappear from the customer app. Past orders keep their details. You can restore it later.</p> : <p><b>{confirm?.row.name}</b> will come back unpublished. Publish it when you are ready.</p>} />
    </>
  );
}
