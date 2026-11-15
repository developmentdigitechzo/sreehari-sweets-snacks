'use client';
import { Gift, Package, Plus, ShoppingCart, Star, Users, Wallet, Bell, Image as ImageIcon, Tag, Target } from 'lucide-react';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useState } from 'react';
import { useFetch } from '@/lib/api';
import { dateTime, num, rupee } from '@/lib/format';
import { Async, Badge, PageHeader, StatCard } from '@/components/ui/kit';
import { useMe, useRange, can } from '@/components/Shell';
import { STATUS } from '@/lib/status';
import { brand, statusColors } from '@/lib/colors';
import { Thumb } from '@/components/ui/Thumb';

type Dash = {
  stats: { orders: number; ordersDelta: number | null; revenue: number; revenueDelta: number | null; customers: number; newCustomers: number; customersDelta: number | null; products: number; rewardMembers: number; lowStock: number };
  series: { date: string; revenue: number; orders: number; customers: number }[];
  orderStatus: { status: string; count: number }[];
  topProducts: { productId: string; name: string; orders: number; revenue: number; imageUrl: string | null; thumbUrl?: string | null }[];
  recentOrders: { id: string; number: string; customer: string; total: number; status: string; paymentStatus?: string; createdAt: string }[];
  alerts: { kind: string; text: string; href: string }[];
};

const COLORS = statusColors;

export default function Dashboard() {
  const days = useRange();
  const me = useMe();
  const { data, error, loading, reload } = useFetch<Dash>(`admin/dashboard?days=${days}`);
  const [metric, setMetric] = useState<'revenue' | 'orders' | 'customers'>('revenue');
  const totalStatus = data?.orderStatus.reduce((n, s) => n + s.count, 0) ?? 0;

  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle={`Welcome back, ${me.name.split(' ')[0]}! Here's what's happening with your store.`} />
      <Async loading={loading} error={error} hasData={!!data} onRetry={reload}>
        {data && (
          <div className="space-y-5">
            {data.alerts.length > 0 && (
              <div className="card flex flex-wrap gap-2 border-warn/30 bg-warn-soft/50 p-3" role="region" aria-label="Needs attention">
                {data.alerts.map((a) => <Link key={a.text} href={a.href} className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-ink shadow-card hover:bg-cream">{a.text}</Link>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-5">
              <StatCard href="/orders" icon={<ShoppingCart />} label="Total Orders" value={num(data.stats.orders)} change={data.stats.ordersDelta} />
              <StatCard href="/payments" icon={<Wallet />} label="Total Revenue" value={rupee(data.stats.revenue)} change={data.stats.revenueDelta} tone="gold" />
              <StatCard href="/customers" icon={<Users />} label="Total Customers" value={num(data.stats.customers)} change={data.stats.customersDelta} sub={`${data.stats.newCustomers} new`} />
              <StatCard href={data.stats.lowStock ? '/inventory?status=low' : '/products'} icon={<Package />} label="Total Products" value={num(data.stats.products)} sub={data.stats.lowStock ? `${data.stats.lowStock} low on stock` : 'Stock levels healthy'} tone={data.stats.lowStock ? 'warn' : 'burgundy'} />
              <StatCard href="/offers/rewards" icon={<Star />} label="Rewards Members" value={num(data.stats.rewardMembers)} tone="gold" sub="With points balance" />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.7fr_1fr]">
              <section className="card p-4 sm:p-5" aria-label="Sales overview">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">Sales Overview</h2>
                  <div className="inline-flex rounded-lg bg-cream-deep p-1 text-sm font-semibold" role="tablist">
                    {(['revenue', 'orders', 'customers'] as const).map((m) => (
                      <button key={m} role="tab" aria-selected={metric === m} onClick={() => setMetric(m)} className={`rounded-md px-3 py-1.5 capitalize ${metric === m ? 'bg-burgundy text-white' : 'text-ink-muted'}`}>{m}</button>
                    ))}
                  </div>
                </div>
                {data.series.every((s) => s[metric] === 0) ? <p className="py-16 text-center text-sm text-ink-muted">No {metric} in this period yet.</p> : (
                  <div className="h-64 sm:h-72" role="img" aria-label={`${metric} per day`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.series} margin={{ left: 0, right: 8, top: 8 }}>
                        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={brand.red} stopOpacity={0.25} /><stop offset="100%" stopColor={brand.red} stopOpacity={0.02} /></linearGradient></defs>
                        <CartesianGrid stroke={brand.border} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11, fill: brand.textMuted }} minTickGap={24} />
                        <YAxis tick={{ fontSize: 11, fill: brand.textMuted }} width={metric === 'revenue' ? 56 : 32} tickFormatter={(v: number) => (metric === 'revenue' ? `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}` : String(v))} />
                        <Tooltip formatter={(v) => (metric === 'revenue' ? rupee(Number(v)) : num(Number(v)))} labelFormatter={(l) => String(l)} />
                        <Area type="monotone" dataKey={metric} stroke={brand.red} strokeWidth={2} fill="url(#g)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              <section className="card p-4 sm:p-5" aria-label="Order status">
                <h2 className="mb-3 section-title">Order Status <span className="font-sans text-sm font-normal text-ink-muted">(Last {days} days)</span></h2>
                {totalStatus === 0 ? <p className="py-16 text-center text-sm text-ink-muted">No orders in this period yet.</p> : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
                    <div className="relative h-44 w-44 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={data.orderStatus} dataKey="count" nameKey="status" innerRadius={52} outerRadius={80} paddingAngle={1} stroke="none">{data.orderStatus.map((s) => <Cell key={s.status} fill={COLORS[s.status] ?? brand.grey} />)}</Pie></PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-bold">{num(totalStatus)}</span><span className="text-xs text-ink-muted">Orders</span></div>
                    </div>
                    <ul className="w-full space-y-2 text-sm">
                      {data.orderStatus.map((s) => (
                        <li key={s.status} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[s.status] ?? brand.grey }} aria-hidden /><span className="flex-1">{STATUS[s.status]?.label ?? s.status}</span><span className="font-semibold">{num(s.count)}</span><span className="w-12 text-right text-ink-muted">{((s.count / totalStatus) * 100).toFixed(1)}%</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
              <section className="card overflow-hidden" aria-label="Top selling products">
                <div className="flex items-center justify-between p-4 pb-2"><h2 className="section-title">Top Selling Products</h2><Link href="/reports" className="text-sm font-semibold text-burgundy">View All ›</Link></div>
                {data.topProducts.length === 0 ? <p className="px-4 pb-6 pt-2 text-sm text-ink-muted">No sales in this period yet.</p> : (
                  <ul className="divide-y divide-line">
                    {data.topProducts.map((p) => (
                      <li key={p.productId} className="flex items-center gap-3 px-4 py-2.5">
                        <Thumb url={p.thumbUrl ?? p.imageUrl} name={p.name} /><span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                        <span className="text-sm text-ink-muted">{num(p.orders)} sold</span><span className="w-20 text-right text-sm font-semibold">{rupee(p.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card p-4" aria-label="Recent orders">
                <div className="mb-2 flex items-center justify-between"><h2 className="section-title">Recent Orders</h2><Link href="/orders" className="text-sm font-semibold text-burgundy">View All ›</Link></div>
                {data.recentOrders.length === 0 ? <p className="py-6 text-sm text-ink-muted">No orders yet.</p> : (
                  <ul className="divide-y divide-line">
                    {data.recentOrders.map((o) => (
                      <li key={o.id}><Link href={`/orders?open=${o.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:bg-cream/50">
                        <div className="min-w-0"><p className="font-semibold text-burgundy">#{o.number}</p><p className="truncate text-xs text-ink-muted">{o.customer} · {dateTime(o.createdAt)}</p></div>
                        <div className="text-right"><p className="text-sm font-semibold">{rupee(o.total)}</p><Badge tone={STATUS[o.status]?.tone}>{STATUS[o.status]?.label ?? o.status}</Badge></div>
                      </Link></li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card p-4" aria-label="Quick actions">
                <h2 className="mb-3 section-title">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {[
                    { href: '/products/new', icon: Plus, label: 'Add Product', perm: 'catalog' },
                    { href: '/offers', icon: Tag, label: 'Create Offer', perm: 'offers' },
                    { href: '/banners', icon: ImageIcon, label: 'Upload Banner', perm: 'banners' },
                    { href: '/notifications', icon: Bell, label: 'Send Notification', perm: 'broadcast' },
                    { href: '/orders', icon: ShoppingCart, label: 'Manage Orders', perm: 'orders' },
                    { href: '/segments', icon: Target, label: 'Customer Segments', perm: 'customers' },
                    { href: '/offers/rewards', icon: Gift, label: 'Rewards', perm: 'offers' },
                  ].filter((q) => can(me, q.perm)).map((q) => (
                    <Link key={q.label} href={q.href} className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border border-line bg-cream/60 p-3 text-center text-sm font-semibold text-ink hover:border-burgundy hover:bg-burgundy-soft"><q.icon className="h-7 w-7 text-burgundy" aria-hidden />{q.label}</Link>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </Async>
    </>
  );
}
