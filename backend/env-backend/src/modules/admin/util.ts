import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient | typeof prisma;

export const num = (d: { toString(): string } | null | undefined) => (d == null ? undefined : Number(d.toString()));

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(100).optional(),
});

export function parsePage(req: Request) {
  const p = pageQuery.parse(req.query);
  return { ...p, skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export const paged = <T>(items: T[], total: number, p: { page: number; pageSize: number }) => ({
  items,
  total,
  page: p.page,
  pageSize: p.pageSize,
  pages: Math.max(1, Math.ceil(total / p.pageSize)),
});

/** Append an audit row. Never put passwords, tokens or provider secrets in `meta`. */
export async function audit(
  req: Request,
  entry: { action: string; entity: string; entityId?: string; summary: string; meta?: Prisma.InputJsonValue },
  db: Db = prisma,
) {
  const s = req.staff!;
  await db.auditLog.create({
    data: { actorId: s.id, actorName: s.name, actorRole: s.role, action: entry.action, entity: entry.entity, entityId: entry.entityId, summary: entry.summary, meta: entry.meta, ip: req.ip },
  });
}

/** CSV with formula-injection protection (cells starting with = + - @ are prefixed). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Date range from ?from=&to= (ISO dates) or ?days=N. Default: last 30 days. */
export function range(req: Request) {
  const q = z.object({ from: z.string().optional(), to: z.string().optional(), days: z.coerce.number().int().min(1).max(366).optional() }).parse(req.query);
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - (q.days ?? 30) * 86_400_000);
  const span = to.getTime() - from.getTime();
  return { from, to, prevFrom: new Date(from.getTime() - span), prevTo: from };
}

export const pct = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 1000) / 10);
