'use client';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useFetch } from '@/lib/api';
import { rupee } from '@/lib/format';
import { Async, Badge, PageHeader } from '@/components/ui/kit';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { Thumb } from '@/components/ui/Thumb';

type Cake = { id: string; name: string; category: string; status: string; image: string | null; thumbUrl?: string | null; variants: { id: string; label: string; price: number; stock: number }[]; cake: { flavours?: string[]; allowsMessage: boolean; messageMaxLength: number; notice: string }; totalStock: number };
type Data = { subcategories: { id: string; name: string; isActive: boolean; count: number }[]; cakes: Cake[] };

export default function Cakes() {
  const { data, error, loading, reload } = useFetch<Data>('admin/cakes');
  const cols: Col<Cake>[] = [
    { key: 'n', title: true, header: 'Cake', cell: (c) => <div className="flex items-center gap-3"><Thumb url={c.thumbUrl ?? c.image} name={c.name} size={44} /><div><p className="font-semibold">{c.name}</p><p className="text-xs text-ink-muted">{c.category}</p></div></div> },
    { key: 's', header: 'Sizes and prices', cell: (c) => <div className="flex flex-wrap gap-1">{c.variants.map((v) => <span key={v.id} className="rounded-full border border-line px-2 py-0.5 text-xs">{v.label} · {rupee(v.price)} · {v.stock} left</span>)}</div> },
    { key: 'f', header: 'Flavours', hideOnMobile: true, cell: (c) => <span className="text-sm">{c.cake.flavours?.length ? c.cake.flavours.join(', ') : '—'}</span> },
    { key: 'm', header: 'Message', cell: (c) => (c.cake.allowsMessage ? <Badge tone="ok">Up to {c.cake.messageMaxLength} chars</Badge> : <Badge tone="gray">Not allowed</Badge>) },
    { key: 'v', header: 'Status', cell: (c) => <Badge tone={c.status === 'active' ? 'ok' : 'gray'} dot>{c.status === 'active' ? 'Published' : 'Unpublished'}</Badge> },
    { key: 'a', header: 'Edit', cell: (c) => <Link href={`/products/${c.id}`} className="inline-flex icon-btn" aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" /></Link> },
  ];
  return (
    <>
      <PageHeader title="Cake Management" subtitle="Sizes and prices, flavours, custom message rules and delivery notices for every cake." crumbs={['Products', 'Cakes']}
        actions={<Link href="/products/new" className="btn-primary">Add cake</Link>} />
      <Async loading={loading} error={error} hasData={!!data} onRetry={reload}>
        {data && (
          <div className="space-y-5">
            <section className="card p-4" aria-label="Cake subcategories">
              <h2 className="mb-3 section-title">Cake categories</h2>
              <ul className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-3">
                {data.subcategories.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm"><span className="font-medium">{s.name}</span><span className="flex items-center gap-2"><span className="text-ink-muted">{s.count} cake{s.count === 1 ? '' : 's'}</span><Badge tone={s.isActive ? 'ok' : 'gray'}>{s.isActive ? 'Visible' : 'Hidden'}</Badge></span></li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">Show, hide, rename or reorder these in <Link className="font-semibold text-burgundy" href="/products/categories">Categories</Link>.</p>
            </section>
            <div className="card overflow-hidden">
              <DataTable rows={data.cakes} cols={cols} rowKey={(c) => c.id} caption="Cakes" />
              {data.cakes.length === 0 && <p className="p-6 text-center text-sm text-ink-muted">No cakes yet. Add a product and tick “This is a cake”.</p>}
            </div>
            <p className="text-sm text-ink-muted">Delivery date and time selection for cakes is not enabled in the customer app. The delivery notice you write on each cake is what customers see.</p>
          </div>
        )}
      </Async>
    </>
  );
}
