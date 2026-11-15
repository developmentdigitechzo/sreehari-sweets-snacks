'use client';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { delta } from '@/lib/format';

export function PageHeader({ title, subtitle, actions, crumbs }: { title: string; subtitle?: string; actions?: ReactNode; crumbs?: string[] }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {crumbs && <p className="mb-1 text-xs text-ink-muted">{crumbs.join('  ›  ')}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ icon, label, value, change, sub, tone = 'burgundy', href }: { icon: ReactNode; label: string; value: ReactNode; change?: number | null; sub?: string; tone?: 'burgundy' | 'gold' | 'warn' | 'bad' | 'ok'; /** Makes the whole card a link to the module that owns this number. */ href?: string }) {
  const d = delta(change);
  const tint = { burgundy: 'bg-burgundy-soft text-burgundy', gold: 'bg-gold-soft text-gold', warn: 'bg-warn-soft text-warn-dark', bad: 'bg-bad-soft text-bad', ok: 'bg-ok-soft text-ok' }[tone];
  const body = (
    <>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 [&>svg]:h-5 [&>svg]:w-5 sm:[&>svg]:h-6 sm:[&>svg]:w-6 ${tint}`} aria-hidden>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs text-ink-muted sm:text-sm">{label}</p>
        <p className="truncate text-lg font-bold leading-tight text-ink sm:text-2xl">{value}</p>
        {d ? <p className={`text-xs font-semibold ${d.up ? 'text-ok' : 'text-bad'}`}>{d.up ? '↑' : '↓'} {d.text.replace(/^[+-]/, '')}</p> : sub ? <p className="text-xs text-ink-muted">{sub}</p> : null}
      </div>
    </>
  );
  const cls = 'card flex items-center gap-2 p-3 sm:gap-3 sm:p-4';
  return href ? <Link href={href} className={`${cls} transition-colors hover:border-burgundy/40 hover:bg-cream/40`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-5">{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1" role="tablist">
      <div className="inline-flex min-w-max gap-1 rounded-xl bg-cream-deep p-1">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${value === t.id ? 'bg-burgundy text-white shadow-card' : 'text-ink-muted hover:text-burgundy'}`}>
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

const BADGE = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn-dark', bad: 'bg-bad-soft text-bad', info: 'bg-info-soft text-info', gray: 'bg-cream-deep text-ink-muted', violet: 'bg-violet-soft text-violet', gold: 'bg-gold-soft text-warn-dark' } as const;
export function Badge({ tone = 'gray', children, dot }: { tone?: keyof typeof BADGE; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <Loader2 className="h-4 w-4 animate-spin" aria-label={label} />;
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-cream-deep" />)}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-bad" aria-hidden />
      <p className="max-w-md text-sm text-ink">{message}</p>
      {onRetry && <button className="btn-outline" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-md text-sm text-ink-muted">{hint}</p>}
      {action}
    </div>
  );
}

/** Renders loading / error / empty / content for a fetch. */
export function Async({ loading, error, empty, emptyTitle = 'Nothing here yet', emptyHint, onRetry, hasData, children }: { loading: boolean; error: string | null; empty?: boolean; emptyTitle?: string; emptyHint?: string; onRetry?: () => void; hasData: boolean; children: ReactNode }) {
  if (loading && !hasData) return <Skeleton />;
  if (error && !hasData) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return <>{children}</>;
}

const CONTROL = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]),select,textarea';

/**
 * Label + control + hint/error. The control is an arbitrary child (often wrapped in a div), so after render the label
 * is linked to the first text control inside: clicking the label focuses the field, screen readers announce its name,
 * and an error is exposed through aria-invalid / aria-describedby.
 */
export function Field({ label, error, hint, children, required }: { label: string; error?: string | null; hint?: string; children: ReactNode; required?: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const lab = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(CONTROL);
    if (!el || !lab.current) return;
    if (!el.id) el.id = `${id}-c`;
    lab.current.htmlFor = el.id;
    if (error) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', `${id}-e`); }
    else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
  });
  return (
    <div ref={box}>
      <label ref={lab} className="label">{label}{required && <span className="text-bad" aria-hidden> *</span>}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-e`} className="mt-1 text-xs font-medium text-bad" role="alert">{error}</p>}
    </div>
  );
}

/**
 * Debounced search box. `value` is only copied into the box when it was changed from outside (for example a reset);
 * the parent echoing back what this box just sent must never overwrite characters typed in the meantime.
 */
export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value);
  const sent = useRef(value);
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; });
  useEffect(() => {
    if (value !== sent.current) { sent.current = value; setLocal(value); }
  }, [value]);
  useEffect(() => {
    if (local === sent.current) return;
    const t = setTimeout(() => { sent.current = local; cb.current(local); }, 350);
    return () => clearTimeout(t);
  }, [local]);
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-burgundy" aria-hidden />
      <input className="input pl-9" type="search" value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Select({ value, onChange, options, label, className = '' }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <select className={`input w-auto min-w-[140px] pr-8 ${className}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Pagination({ page, pages, total, pageSize, onPage, onPageSize, noun }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void; onPageSize?: (n: number) => void; noun: string }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums: (number | '…')[] = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
      <p className="text-ink-muted">Showing {from}–{to} of {total} {noun}</p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSize && (
          <select className="input w-auto" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page">
            {[10, 25, 50].map((n) => <option key={n} value={n}>{n} per page</option>)}
          </select>
        )}
        <button className="btn-outline btn-sm !px-2" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        <div className="hidden gap-1 sm:flex">
          {nums.map((n, i) => n === '…' ? <span key={`e${i}`} className="px-1 py-2 text-ink-faint">…</span> : (
            <button key={n} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} className={`min-h-[36px] min-w-[36px] rounded-lg px-2 text-sm font-semibold ${n === page ? 'bg-burgundy text-white' : 'border border-line bg-white text-ink hover:bg-burgundy-soft'}`}>{n}</button>
          ))}
        </div>
        <span className="text-ink-muted sm:hidden">Page {page}/{pages}</span>
        <button className="btn-outline btn-sm !px-2" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/** Number of dialogs currently open. A side panel must not react to Escape while a dialog sits on top of it. */
let openDialogs = 0;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: focus moves to the first field when it opens, Tab stays inside, Escape closes it and focus returns
 * to the button that opened it. `persistent` forms ignore a click on the backdrop so unsaved input is never lost by
 * accident, and `locked` (while saving) ignores Escape and the backdrop as well.
 *
 * The effect depends on `open` only. Parents pass a new `onClose` on every render (and re-render on every keystroke),
 * so depending on it would re-run the focus call after each character and pull focus out of the field being typed in.
 */
export function Modal({ open, onClose, title, children, footer, wide, persistent, locked }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; persistent?: boolean; locked?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(!!locked);
  useEffect(() => { closeRef.current = onClose; lockedRef.current = !!locked; });
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    const prev = document.activeElement as HTMLElement | null;
    openDialogs += 1;
    document.body.style.overflow = 'hidden';
    if (!root.contains(document.activeElement)) (root.querySelector<HTMLElement>(`${CONTROL},[data-autofocus]`) ?? root).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (!lockedRef.current) closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); root.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      openDialogs -= 1;
      if (openDialogs === 0) document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open]);
  /** Enter in a single-line field presses the dialog's main button, like a form would. */
  const submitOnEnter = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = e.target;
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || !(t instanceof HTMLInputElement)) return;
    if (['checkbox', 'radio', 'file', 'button', 'submit'].includes(t.type)) return;
    const main = ref.current?.querySelector<HTMLButtonElement>('[data-footer] .btn-primary:not(:disabled), [data-footer] .btn-danger:not(:disabled)');
    if (main) { e.preventDefault(); main.click(); }
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 bg-ink/50" onClick={persistent || locked ? undefined : onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} onKeyDown={submitOnEnter} className={`relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={id} className="section-title">{title}</h2>
          <button onClick={onClose} disabled={locked} aria-label="Close" className="icon-btn text-ink-muted"><X className="h-5 w-5 text-ink-faint" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div data-footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose, children }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void; children?: ReactNode }) {
  return (
    <Modal open={open} onClose={onClose} persistent={!!children} locked={busy} title={title} footer={<>
      <button className="btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
      <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>{busy && <Spinner />}{confirmLabel}</button>
    </>}>
      <div className="space-y-3 text-sm text-ink">{message}{children}</div>
    </Modal>
  );
}

/** Right-hand detail panel on large screens, full-screen sheet on phones. */
export function SidePanel({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const closeRef = useRef(onClose);
  const root = useRef<HTMLElement>(null);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    root.current?.focus();
    // A dialog opened from inside the panel owns Escape; the panel must stay open behind it.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && openDialogs === 0) closeRef.current(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <aside ref={root} tabIndex={-1} className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl outline-none sm:w-[420px]">
        <div className="flex items-center justify-between bg-burgundy px-5 py-4 text-white">
          <h2 className="section-title !text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="icon-btn hover:bg-white/10"><X className="h-5 w-5 text-ink-faint" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-line p-4">{footer}</div>}
      </aside>
    </div>
  );
}
