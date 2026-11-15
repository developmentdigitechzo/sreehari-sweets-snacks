import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { imageSrc } from '../catalog/imageUrls.js';
import { requirePermission } from './guard.js';
import { getSetting } from './settings.service.js';
import { num, paged, parsePage, pct, range, toCsv } from './util.js';

export const adminDashboardRouter = Router();

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

type Alert = { kind: string; text: string; href: string };
const buildAlerts = (lowStock: number, pendingReturns: number, pendingOrders: number): Alert[] => {
  const alerts: Alert[] = [];
  if (lowStock) alerts.push({ kind: 'stock', text: `${lowStock} product size(s) are low or out of stock`, href: '/inventory?status=low' });
  if (pendingReturns) alerts.push({ kind: 'returns', text: `${pendingReturns} return/cancellation request(s) need a decision`, href: '/returns' });
  if (pendingOrders) alerts.push({ kind: 'orders', text: `${pendingOrders} new order(s) waiting to be confirmed`, href: '/orders?tab=pending' });
  return alerts;
};

/**
 * Only the notification-bell alerts: three small counts. The bell loads on EVERY admin page, so it must not run the full
 * dashboard report (about fifteen queries) just to read three numbers.
 */
adminDashboardRouter.get('/admin/alerts', requirePermission('dashboard'), async (_req, res) => {
  const { lowStockThreshold } = await getSetting('store');
  const [lowStock, pendingReturns, pendingOrders] = await Promise.all([
    prisma.productVariant.count({ where: { stock: { lte: lowStockThreshold }, product: { archivedAt: null, isActive: true } } }),
    prisma.returnRequest.count({ where: { status: 'REQUESTED' } }),
    prisma.order.count({ where: { status: 'PLACED' } }),
  ]);
  res.json({ alerts: buildAlerts(lowStock, pendingReturns, pendingOrders) });
});

/** All numbers come from the database for the selected range; deltas compare with the previous period of the same length. */
adminDashboardRouter.get('/admin/dashboard', requirePermission('dashboard'), async (req, res) => {
  const r = range(req);
  const live = { status: { not: 'CANCELLED' as const } };
  const [cur, prev, customers, newCust, prevNewCust, products, rewardMembers, orders, byStatus, lowAt, topItems, pendingReturns, pendingOrders, joined] = await Promise.all([
    prisma.order.aggregate({ where: { ...live, createdAt: { gte: r.from, lte: r.to } }, _count: true, _sum: { total: true } }),
    prisma.order.aggregate({ where: { ...live, createdAt: { gte: r.prevFrom, lte: r.prevTo } }, _count: true, _sum: { total: true } }),
    prisma.customer.count({ where: { role: 'CUSTOMER' } }),
    prisma.customer.count({ where: { role: 'CUSTOMER', createdAt: { gte: r.from, lte: r.to } } }),
    prisma.customer.count({ where: { role: 'CUSTOMER', createdAt: { gte: r.prevFrom, lte: r.prevTo } } }),
    prisma.product.count({ where: { archivedAt: null } }),
    prisma.rewardLedger.groupBy({ by: ['customerId'], _sum: { points: true }, having: { points: { _sum: { gt: 0 } } } }),
    prisma.order.findMany({ where: { createdAt: { gte: r.from, lte: r.to } }, select: { createdAt: true, total: true, status: true, customerId: true } }),
    prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: r.from, lte: r.to } }, _count: true }),
    getSetting('store'),
    prisma.orderItem.groupBy({ by: ['productId', 'name'], where: { order: { ...live, createdAt: { gte: r.from, lte: r.to } } }, _sum: { qty: true, unitPrice: true }, orderBy: { _sum: { qty: 'desc' } }, take: 5 }),
    prisma.returnRequest.count({ where: { status: 'REQUESTED' } }),
    prisma.order.count({ where: { status: 'PLACED' } }),
    prisma.customer.findMany({ where: { role: 'CUSTOMER', createdAt: { gte: r.from, lte: r.to } }, select: { createdAt: true } }),
  ]);

  // Daily series (revenue, orders, new customers) with zero-filled days.
  const days = Math.min(366, Math.max(1, Math.ceil((r.to.getTime() - r.from.getTime()) / 86_400_000)));
  const series: Record<string, { date: string; revenue: number; orders: number; customers: number }> = {};
  for (let i = 0; i <= days; i++) {
    const d = new Date(r.from.getTime() + i * 86_400_000);
    series[dayKey(d)] = { date: dayKey(d), revenue: 0, orders: 0, customers: 0 };
  }
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue;
    const s = series[dayKey(o.createdAt)];
    if (s) { s.revenue += num(o.total)!; s.orders += 1; }
  }
  for (const c of joined) { const s = series[dayKey(c.createdAt)]; if (s) s.customers += 1; }

  const rev = num(cur._sum.total) ?? 0;
  const [lowStock, recent, topRevenue] = await Promise.all([
    prisma.productVariant.count({ where: { stock: { lte: lowAt.lowStockThreshold }, product: { archivedAt: null, isActive: true } } }),
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { customer: { select: { name: true } }, payment: { select: { status: true } } } }),
    prisma.orderItem.groupBy({ by: ['productId'], where: { order: { ...live, createdAt: { gte: r.from, lte: r.to } } }, _sum: { qty: true }, orderBy: { _sum: { qty: 'desc' } }, take: 5 }),
  ]);
  const topIds = topRevenue.map((t) => t.productId);
  const [topRows, imgs] = await Promise.all([
    prisma.orderItem.findMany({ where: { productId: { in: topIds }, order: { ...live, createdAt: { gte: r.from, lte: r.to } } }, select: { productId: true, unitPrice: true, qty: true } }),
    prisma.productImage.findMany({ where: { productId: { in: topIds } }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const alerts = buildAlerts(lowStock, pendingReturns, pendingOrders);

  res.json({
    range: { from: r.from, to: r.to },
    stats: {
      orders: cur._count, ordersDelta: pct(cur._count, prev._count),
      revenue: rev, revenueDelta: pct(rev, num(prev._sum.total) ?? 0),
      customers, newCustomers: newCust, customersDelta: pct(newCust, prevNewCust),
      products, rewardMembers: rewardMembers.length, lowStock,
    },
    series: Object.values(series),
    orderStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
    topProducts: topIds.map((id) => {
      const rows = topRows.filter((x) => x.productId === id);
      const name = topItems.find((t) => t.productId === id)?.name ?? id;
      return { productId: id, name, orders: rows.reduce((n, x) => n + x.qty, 0), revenue: rows.reduce((n, x) => n + (num(x.unitPrice) ?? 0) * x.qty, 0), imageUrl: imgs.find((i) => i.productId === id)?.url ?? null, imageKey: imgs.find((i) => i.productId === id)?.key ?? null, thumbUrl: imageSrc(imgs.find((i) => i.productId === id)?.url, imgs.find((i) => i.productId === id)?.key) };
    }),
    recentOrders: recent.map((o) => ({ id: o.id, number: o.number, customer: o.customer.name, total: num(o.total), status: o.status, paymentStatus: o.payment?.status, createdAt: o.createdAt })),
    alerts,
  });
});

/* ---------- Reports (JSON or CSV) ---------- */
const reportQ = z.object({ type: z.enum(['sales', 'products', 'categories', 'customers', 'inventory', 'payments']).default('sales'), group: z.enum(['day', 'week', 'month']).default('day'), format: z.enum(['json', 'csv']).default('json') });

adminDashboardRouter.get('/admin/reports', requirePermission('reports'), async (req, res) => {
  const q = reportQ.parse(req.query);
  const r = range(req);
  const live = { status: { not: 'CANCELLED' as const }, createdAt: { gte: r.from, lte: r.to } };
  let headers: string[] = [];
  let rows: (string | number | null)[][] = [];

  if (q.type === 'sales') {
    const orders = await prisma.order.findMany({ where: live, select: { createdAt: true, total: true, subtotal: true, couponDiscount: true, deliveryFee: true } });
    const key = (d: Date) => {
      if (q.group === 'month') return d.toISOString().slice(0, 7);
      if (q.group === 'week') { const x = new Date(d); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return `Week of ${x.toISOString().slice(0, 10)}`; }
      return d.toISOString().slice(0, 10);
    };
    const m = new Map<string, { orders: number; revenue: number; discounts: number; delivery: number }>();
    for (const o of orders) {
      const k = key(o.createdAt);
      const x = m.get(k) ?? { orders: 0, revenue: 0, discounts: 0, delivery: 0 };
      x.orders++; x.revenue += num(o.total)!; x.discounts += num(o.couponDiscount)!; x.delivery += num(o.deliveryFee)!;
      m.set(k, x);
    }
    headers = ['Period', 'Orders', 'Revenue (INR)', 'Coupon discounts (INR)', 'Delivery fees (INR)', 'Avg order (INR)'];
    rows = [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, x.orders, Math.round(x.revenue), Math.round(x.discounts), Math.round(x.delivery), Math.round(x.revenue / x.orders)]);
  } else if (q.type === 'products' || q.type === 'categories') {
    const items = await prisma.orderItem.findMany({ where: { order: live }, select: { productId: true, name: true, qty: true, unitPrice: true } });
    const prods = await prisma.product.findMany({ select: { id: true, category: { select: { name: true } } } });
    const cat = new Map(prods.map((p) => [p.id, p.category.name]));
    const m = new Map<string, { label: string; qty: number; revenue: number }>();
    for (const i of items) {
      const k = q.type === 'products' ? i.productId : cat.get(i.productId) ?? 'Unknown';
      const x = m.get(k) ?? { label: q.type === 'products' ? i.name : k, qty: 0, revenue: 0 };
      x.qty += i.qty; x.revenue += (num(i.unitPrice) ?? 0) * i.qty;
      m.set(k, x);
    }
    headers = [q.type === 'products' ? 'Product' : 'Category', 'Units sold', 'Revenue (INR)'];
    rows = [...m.values()].sort((a, b) => b.revenue - a.revenue).map((x) => [x.label, x.qty, Math.round(x.revenue)]);
  } else if (q.type === 'customers') {
    const agg = await prisma.order.groupBy({ by: ['customerId'], where: live, _count: true, _sum: { total: true }, _max: { createdAt: true } });
    const people = await prisma.customer.findMany({ where: { id: { in: agg.map((a) => a.customerId) } }, select: { id: true, name: true, phone: true } });
    const by = new Map(people.map((c) => [c.id, c]));
    headers = ['Customer', 'Phone', 'Orders', 'Spend (INR)', 'Last order'];
    rows = agg.sort((a, b) => (num(b._sum.total) ?? 0) - (num(a._sum.total) ?? 0)).map((a) => [by.get(a.customerId)?.name ?? '', by.get(a.customerId)?.phone ?? '', a._count, Math.round(num(a._sum.total) ?? 0), a._max.createdAt?.toISOString().slice(0, 10) ?? '']);
  } else if (q.type === 'inventory') {
    const lowAt = (await getSetting('store')).lowStockThreshold;
    const vs = await prisma.productVariant.findMany({ where: { product: { archivedAt: null } }, include: { product: { select: { name: true } } }, orderBy: { stock: 'asc' } });
    headers = ['SKU', 'Product', 'Size', 'Stock', 'Status'];
    rows = vs.map((v) => [v.sku, v.product.name, v.label, v.stock, v.stock === 0 ? 'Out of stock' : v.stock <= lowAt ? 'Low' : 'OK']);
  } else {
    const pays = await prisma.payment.findMany({ where: { createdAt: { gte: r.from, lte: r.to } }, include: { order: { select: { number: true } } }, orderBy: { createdAt: 'desc' }, take: 10000 });
    headers = ['Order', 'Date', 'Method', 'Status', 'Amount (INR)', 'Provider', 'Reference'];
    rows = pays.map((x) => [x.order.number, x.createdAt.toISOString(), x.method, x.status, num(x.amount) ?? 0, x.simulated ? 'simulated' : x.provider, x.reference]);
  }

  if (q.format === 'csv') {
    res.type('text/csv').set('Content-Disposition', `attachment; filename="${q.type}-report.csv"`).send(toCsv(headers, rows));
    return;
  }
  const p = parsePage(req);
  res.json({ headers, ...paged(rows.slice(p.skip, p.skip + p.take), rows.length, p), range: { from: r.from, to: r.to } });
});
