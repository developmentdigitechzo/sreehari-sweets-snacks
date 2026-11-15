'use client';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, useFetch } from '@/lib/api';
import { decimalOnly, digitsOnly } from '@/lib/format';
import { Async, Field, PageHeader } from '@/components/ui/kit';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { toast } from '@/components/ui/Toast';

type Variant = { id?: string; sku: string; label: string; mrp: string; price: string; stock: string; popular: boolean };
type Product = {
  id: string; name: string; tagline: string; description: string; categoryId: string; badge: string | null; tags: string[]; isActive: boolean; archivedAt: string | null;
  featured: { bestseller?: boolean; newArrival?: boolean; festive?: boolean }; cake: { flavours?: string[]; allowsMessage: boolean; messageMaxLength: number; notice: string } | null;
  images: { id: string; url: string | null; key: string | null }[]; variants: { id: string; sku: string; label: string; mrp: number; price: number; stock: number; popular: boolean }[];
};
type Cats = { items: { id: string; name: string; parentId: string | null }[] };

const blank: Variant = { sku: '', label: '', mrp: '', price: '', stock: '0', popular: false };

export function ProductForm({ id }: { id?: string }) {
  const router = useRouter();
  const existing = useFetch<Product>(id ? `admin/products/${id}` : null);
  const cats = useFetch<Cats>('admin/categories');
  const [f, setF] = useState({ name: '', tagline: '', description: '', categoryId: '', badge: '', tags: '', isActive: true, bestseller: false, newArrival: false, festive: false });
  const [variants, setVariants] = useState<Variant[]>([{ ...blank }]);
  const [images, setImages] = useState<{ id?: string; url: string }[]>([]);
  const [keptKeyImages, setKept] = useState<string[]>([]);
  const [isCake, setIsCake] = useState(false);
  const [cake, setCake] = useState({ flavours: '', allowsMessage: true, messageMaxLength: '30', notice: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setF({ name: p.name, tagline: p.tagline, description: p.description, categoryId: p.categoryId, badge: p.badge ?? '', tags: p.tags.join(', '), isActive: p.isActive, bestseller: !!p.featured.bestseller, newArrival: !!p.featured.newArrival, festive: !!p.featured.festive });
    setVariants(p.variants.map((v) => ({ id: v.id, sku: v.sku, label: v.label, mrp: String(v.mrp), price: String(v.price), stock: String(v.stock), popular: v.popular })));
    setImages(p.images.filter((i) => i.url).map((i) => ({ id: i.id, url: i.url! })));
    setKept(p.images.filter((i) => !i.url).map((i) => i.id));
    if (p.cake) { setIsCake(true); setCake({ flavours: (p.cake.flavours ?? []).join(', '), allowsMessage: p.cake.allowsMessage, messageMaxLength: String(p.cake.messageMaxLength), notice: p.cake.notice }); }
  }, [existing.data]);

  const archived = !!existing.data?.archivedAt;
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const setV = (i: number, k: keyof Variant, v: string | boolean) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = 'Enter the product name';
    if (!f.categoryId) e.categoryId = 'Choose a category';
    const skus = new Set<string>();
    variants.forEach((v, i) => {
      if (!/^[A-Za-z0-9._-]{3,40}$/.test(v.sku)) e[`sku${i}`] = '3–40 letters, numbers, . _ -';
      else if (skus.has(v.sku.toUpperCase())) e[`sku${i}`] = 'Duplicate SKU';
      skus.add(v.sku.toUpperCase());
      if (!v.label.trim()) e[`label${i}`] = 'Size / weight';
      const mrp = Number(v.mrp), price = Number(v.price);
      if (v.mrp === '' || !(mrp >= 0)) e[`mrp${i}`] = 'Enter MRP';
      if (v.price === '' || !(price >= 0)) e[`price${i}`] = 'Enter price';
      else if (price > mrp) e[`price${i}`] = 'Cannot be above MRP';
      if (!v.id && (!/^\d+$/.test(v.stock))) e[`stock${i}`] = 'Whole number';
    });
    if (isCake && !(Number(cake.messageMaxLength) >= 0 && Number(cake.messageMaxLength) <= 80)) e.msgLen = '0–80';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy || !validate()) { toast('Please fix the highlighted fields', 'bad'); return; }
    setBusy(true);
    const body = {
      name: f.name.trim(), tagline: f.tagline.trim(), description: f.description.trim(), categoryId: f.categoryId, badge: f.badge.trim() || null,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), isActive: f.isActive, featured: { bestseller: f.bestseller, newArrival: f.newArrival, festive: f.festive },
      cake: isCake ? { flavours: cake.flavours.split(',').map((t) => t.trim()).filter(Boolean), allowsMessage: cake.allowsMessage, messageMaxLength: Number(cake.messageMaxLength), notice: cake.notice.trim() } : null,
      images: [...keptKeyImages.map((id) => ({ id })), ...images.map((i) => ({ id: i.id, url: i.url }))],
      variants: variants.map((v) => ({ id: v.id, sku: v.sku.trim(), label: v.label.trim(), mrp: Number(v.mrp), price: Number(v.price), popular: v.popular, stock: v.id ? undefined : Number(v.stock) })),
    };
    try {
      await api(id ? `admin/products/${id}` : 'admin/products', { method: id ? 'PUT' : 'POST', body });
      toast(id ? 'Product saved. The customer app shows the change now.' : 'Product created');
      router.push('/products');
    } catch (e) {
      const err = e as ApiError;
      if (err.field === 'sku') setErrors({ sku0: err.message });
      toast(err.message, 'bad');
      setBusy(false);
    }
  };

  const cat = cats.data?.items.find((c) => c.id === f.categoryId);
  const cakeLikely = cat?.parentId === 'cakes' || cat?.id === 'cakes';

  return (
    <>
      <PageHeader title={id ? 'Edit Product' : 'Add New Product'} subtitle="Prices, sizes and availability update in the customer app as soon as you save." crumbs={['Products', id ? 'Edit' : 'New']}
        actions={<Link href="/products" className="btn-outline">Back to products</Link>} />
      <Async loading={!!id && existing.loading} error={existing.error} hasData={!id || !!existing.data} onRetry={existing.reload}>
        {archived && <p className="card mb-4 border-warn/40 bg-warn-soft p-3 text-sm">This product is archived. Restore it from the product list before editing.</p>}
        <form onSubmit={save} noValidate className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5">
            <section className="card space-y-4 p-4 sm:p-5">
              <h2 className="section-title">Basic details</h2>
              <Field label="Product name" required error={errors.name}><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={100} disabled={archived} /></Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Category" required error={errors.categoryId} hint="Pick the most specific category (for example Milk Sweets, not Sweets) so the product shows in the right tab of the app.">
                  <select className="input" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} disabled={archived}>
                    <option value="">Select a category</option>
                    {(cats.data?.items ?? []).filter((c) => !c.parentId).map((root) => {
                      const kids = (cats.data?.items ?? []).filter((k) => k.parentId === root.id);
                      return kids.length ? <optgroup key={root.id} label={root.name}>{kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</optgroup> : <option key={root.id} value={root.id}>{root.name}</option>;
                    })}
                  </select>
                </Field>
                <Field label="Badge" hint="Short label such as Bestseller"><input className="input" value={f.badge} onChange={(e) => set('badge', e.target.value)} maxLength={24} disabled={archived} /></Field>
              </div>
              <Field label="Tagline"><input className="input" value={f.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={160} disabled={archived} /></Field>
              <Field label="Description"><textarea className="input min-h-[96px] py-2" value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} disabled={archived} /></Field>
              <Field label="Search tags" hint="Comma separated, e.g. ghee, festive, gift"><input className="input" value={f.tags} onChange={(e) => set('tags', e.target.value)} disabled={archived} /></Field>
            </section>

            <section className="card p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="section-title">Sizes, SKU and pricing</h2>
                <button type="button" className="btn-outline btn-sm" onClick={() => setVariants((v) => [...v, { ...blank }])} disabled={archived || variants.length >= 12}><Plus className="h-4 w-4" />Add size</button></div>
              <div className="space-y-3">
                {variants.map((v, i) => (
                  <div key={v.id ?? `n${i}`} className="grid grid-cols-2 gap-3 rounded-xl border border-line p-3 sm:grid-cols-6">
                    <Field label="Size" error={errors[`label${i}`]}><input className="input" value={v.label} onChange={(e) => setV(i, 'label', e.target.value)} placeholder="250g" disabled={archived} /></Field>
                    <Field label="SKU" error={errors[`sku${i}`]}><input className="input" value={v.sku} onChange={(e) => setV(i, 'sku', e.target.value)} disabled={archived} /></Field>
                    <Field label="MRP (₹)" error={errors[`mrp${i}`]}><input className="input" inputMode="decimal" value={v.mrp} onChange={(e) => setV(i, 'mrp', decimalOnly(e.target.value))} disabled={archived} /></Field>
                    <Field label="Price (₹)" error={errors[`price${i}`]}><input className="input" inputMode="decimal" value={v.price} onChange={(e) => setV(i, 'price', decimalOnly(e.target.value))} disabled={archived} /></Field>
                    <Field label={v.id ? 'Stock' : 'Opening stock'} error={errors[`stock${i}`]} hint={v.id ? 'Change in Inventory' : undefined}>
                      <input className="input" inputMode="numeric" value={v.stock} onChange={(e) => setV(i, 'stock', digitsOnly(e.target.value))} disabled={!!v.id || archived} />
                    </Field>
                    <div className="flex items-end justify-between gap-2">
                      <label className="flex min-h-[42px] items-center gap-2 text-sm"><input type="checkbox" checked={v.popular} onChange={(e) => setV(i, 'popular', e.target.checked)} disabled={archived} />Popular</label>
                      {!v.id && variants.length > 1 && <button type="button" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))} aria-label="Remove size" className="icon-btn icon-btn-bad"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </div>
                ))}
              </div>
              {id && <p className="mt-2 text-xs text-ink-muted">Saved sizes cannot be deleted because past orders refer to them. Set a size&apos;s stock to 0 in Inventory to stop selling it.</p>}
            </section>

            <section className="card space-y-3 p-4 sm:p-5">
              <label className="flex items-center gap-2 section-title"><input type="checkbox" checked={isCake} onChange={(e) => setIsCake(e.target.checked)} disabled={archived} />This is a cake{cakeLikely && !isCake ? ' (category suggests so)' : ''}</label>
              {isCake && (
                <div className="space-y-4">
                  <Field label="Flavours" hint="Comma separated. Customers pick one."><input className="input" value={cake.flavours} onChange={(e) => setCake((c) => ({ ...c, flavours: e.target.value }))} disabled={archived} /></Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex min-h-[42px] items-center gap-2 text-sm"><input type="checkbox" checked={cake.allowsMessage} onChange={(e) => setCake((c) => ({ ...c, allowsMessage: e.target.checked }))} disabled={archived} />Allow a message on the cake</label>
                    <Field label="Message length limit" error={errors.msgLen}><input className="input" inputMode="numeric" value={cake.messageMaxLength} onChange={(e) => setCake((c) => ({ ...c, messageMaxLength: digitsOnly(e.target.value) }))} disabled={archived} /></Field>
                  </div>
                  <Field label="Delivery notice shown to customers" hint="For example lead time or same-day limits"><textarea className="input min-h-[72px] py-2" value={cake.notice} onChange={(e) => setCake((c) => ({ ...c, notice: e.target.value }))} maxLength={300} disabled={archived} /></Field>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-5">
            <section className="card space-y-3 p-4 sm:p-5">
              <h2 className="section-title">Visibility</h2>
              <label className="flex min-h-[42px] items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} disabled={archived} />Published (visible in the customer app)</label>
              <p className="text-xs text-ink-muted">Every published product shows in its category and in search. New products also appear in the app&apos;s “New” shelf for 14 days. Tick the boxes below to feature a product on Home permanently.</p>
              <label className="flex min-h-[38px] items-center gap-2 text-sm"><input type="checkbox" checked={f.bestseller} onChange={(e) => set('bestseller', e.target.checked)} disabled={archived} />Featured: Bestseller</label>
              <label className="flex min-h-[38px] items-center gap-2 text-sm"><input type="checkbox" checked={f.newArrival} onChange={(e) => set('newArrival', e.target.checked)} disabled={archived} />Featured: New arrival</label>
              <label className="flex min-h-[38px] items-center gap-2 text-sm"><input type="checkbox" checked={f.festive} onChange={(e) => set('festive', e.target.checked)} disabled={archived} />Featured: Festive</label>
            </section>
            <section className="card space-y-3 p-4 sm:p-5">
              <h2 className="section-title">Images</h2>
              {keptKeyImages.length > 0 && <p className="rounded-lg bg-cream p-2 text-xs text-ink-muted">{keptKeyImages.length} bundled demo image(s) are kept. Upload your own photos below; they are shown first.</p>}
              <ImageUpload value={images.map((i) => i.url)} max={5} label="Add photo"
                onChange={(urls) => setImages(urls.map((u) => images.find((i) => i.url === u) ?? { url: u }))} />
            </section>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary flex-1" disabled={busy || archived}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{id ? 'Save changes' : 'Create product'}</button>
              <Link href="/products" className="btn-outline">Cancel</Link>
            </div>
          </div>
        </form>
      </Async>
    </>
  );
}
