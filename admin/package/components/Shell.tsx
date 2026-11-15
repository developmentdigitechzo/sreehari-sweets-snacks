'use client';
import { Bell, Calendar, ChevronDown, LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, useFetch } from '@/lib/api';
import { withBase } from '@/lib/base';
import { NAV } from '@/lib/nav';
import { Select } from '@/components/ui/kit';

type Me = { id: string; name: string; email: string; role: 'SUPER_ADMIN' | 'MANAGER'; permissions: string[] };
const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx)!;
export const can = (me: Me, p?: string) => !p || me.permissions.includes(p);

const RangeCtx = createContext<{ days: number; setDays: (n: number) => void }>({ days: 30, setDays: () => undefined });
export const useRange = () => useContext(RangeCtx).days;

const RANGES = [{ value: '7', label: 'Last 7 Days' }, { value: '30', label: 'Last 30 Days' }, { value: '90', label: 'Last 90 Days' }, { value: '365', label: 'Last 12 Months' }];

function Logo() {
  return (
    <div className="px-5 pb-4 pt-6 text-center text-white">
      <svg viewBox="0 0 48 32" className="mx-auto h-8 w-12 text-gold" aria-hidden fill="currentColor"><path d="M24 2c2 5 2 9 0 13-2-4-2-8 0-13Zm-9 6c3 3 5 6 5 10-4-2-6-6-5-10Zm18 0c1 4-1 8-5 10 0-4 2-7 5-10ZM6 14c4 1 7 3 9 7-4 0-8-3-9-7Zm36 0c-1 4-5 7-9 7 2-4 5-6 9-7ZM24 18c5 0 9 3 10 8H14c1-5 5-8 10-8Z" /></svg>
      <p className="font-serif text-2xl font-bold leading-tight">Shree Hari<sup className="text-[10px]">®</sup></p>
      <p className="text-[11px] tracking-wide text-white/80">— Sweets &amp; Snacks —</p>
    </div>
  );
}

function SideNav({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const path = usePathname();
  const items = NAV.filter((n) => can(me, n.perm));
  const isActive = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const groupActive = (n: (typeof NAV)[number]) => isActive(n.href) || !!n.children?.some((c) => isActive(c.href));
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setOpen(null), [path]);
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
      <ul className="space-y-1">
        {items.map((n) => {
          const active = groupActive(n);
          const kids = n.children?.filter((c) => can(me, c.perm));
          const expanded = !!kids?.length && (open === n.label || (open === null && active));
          const Icon = n.icon;
          return (
            <li key={n.label}>
              <div className={`flex items-center rounded-xl ${active ? (kids?.length ? 'bg-white/15 text-white' : 'bg-cream text-burgundy') : 'text-white/90 hover:bg-white/10'}`}>
                <Link href={n.href} onClick={onNavigate} aria-current={active && !kids?.length ? 'page' : undefined} className="flex min-h-[44px] flex-1 items-center gap-3 px-3 text-[15px] font-semibold">
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />{n.label}
                </Link>
                {!!kids?.length && (
                  <button onClick={() => setOpen(expanded ? '' : n.label)} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${n.label}`} aria-expanded={expanded} className="mr-2 rounded-lg p-2 hover:bg-white/10">
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>
              {expanded && (
                <ul className="ml-5 mt-1 space-y-0.5 border-l border-white/20 pl-3">
                  {kids!.map((c) => (
                    <li key={c.href}>
                      <Link href={c.href} onClick={onNavigate} aria-current={path === c.href ? 'page' : undefined} className={`flex min-h-[38px] items-center gap-2 rounded-lg px-3 text-sm ${path === c.href ? 'bg-white/15 font-semibold text-white' : 'text-white/80 hover:bg-white/10'}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Sidebar({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-burgundy to-burgundy-dark">
      <Logo />
      <SideNav me={me} onNavigate={onNavigate} />
      <div className="m-3 rounded-xl border border-gold/40 bg-white/10 p-3 text-white">
        <p className="text-xs text-white/80">Customer app</p>
        <p className="text-sm font-semibold">Your changes go live in the app straight away.</p>
      </div>
    </div>
  );
}

function Bell_({ }: object) {
  const { data, reload } = useFetch<{ alerts: { kind: string; text: string; href: string }[] }>('admin/alerts');
  // Keep the bell current without a page refresh (new orders, low stock, return requests).
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 30_000);
    return () => clearInterval(t);
  }, [reload]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const n = data?.alerts.length ?? 0;
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications${n ? `, ${n} need attention` : ''}`} aria-expanded={open} className="relative rounded-full p-2 hover:bg-cream-deep" aria-haspopup="true">
        <Bell className="h-6 w-6 text-navy" />
        {n > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-bad ring-2 ring-white" />}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-72 rounded-xl border border-line bg-white p-2 shadow-card">
          {n === 0 ? <p className="p-3 text-sm text-ink-muted">Nothing needs your attention right now.</p> : data!.alerts.map((a) => (
            <Link key={a.text} href={a.href} onClick={() => setOpen(false)} className="block rounded-lg p-3 text-sm hover:bg-cream">{a.text}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: me, error, reload } = useFetch<{ user: Me }>('admin/auth/me');
  const [drawer, setDrawer] = useState(false);
  const [days, setDays] = useState(30);
  const path = usePathname();
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
  }, [drawer]);
  const range = useMemo(() => ({ days, setDays }), [days]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="card max-w-sm p-6">
          <p className="font-semibold">Could not load your account</p>
          <p className="mt-1 text-sm text-ink-muted">{error}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className="btn-outline" onClick={reload}>Try again</button>
            <button className="btn-primary" onClick={async () => { await fetch(withBase('/api/session'), { method: 'DELETE' }).catch(() => undefined); router.replace('/login'); }}>Back to sign in</button>
          </div>
        </div>
      </div>
    );
  }
  if (!me) return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-pulse rounded-full bg-burgundy-soft" aria-label="Loading" /></div>;
  const user = me.user;

  const signOut = async () => {
    await fetch(withBase('/api/session'), { method: 'DELETE' });
    router.replace('/login');
  };

  return (
    <MeCtx.Provider value={user}>
      <RangeCtx.Provider value={range}>
        <div className="min-h-screen lg:grid lg:grid-cols-[270px_1fr]">
          <aside className="sticky top-0 hidden h-screen lg:block"><Sidebar me={user} /></aside>
          {drawer && (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <div className="absolute inset-0 bg-ink/50" onClick={() => setDrawer(false)} aria-hidden />
              <div className="absolute inset-y-0 left-0 w-[290px] max-w-[86vw] shadow-2xl">
                <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-2 top-2 z-10 rounded-lg p-2 text-white hover:bg-white/10"><X className="h-5 w-5" /></button>
                <Sidebar me={user} onNavigate={() => setDrawer(false)} />
              </div>
            </div>
          )}
          <div className="min-w-0">
            <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-cream/90 px-4 py-2 backdrop-blur sm:px-6">
              <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-lg p-2 text-navy hover:bg-cream-deep lg:hidden"><Menu className="h-6 w-6" /></button>
              <p className="whitespace-nowrap section-title lg:hidden">Shree Hari</p>
              <div className="ml-auto flex items-center gap-1 sm:gap-3">
                <div className="hidden items-center gap-2 sm:flex">
                  <Calendar className="h-4 w-4 text-navy" aria-hidden />
                  <Select label="Date range" value={String(days)} onChange={(v) => setDays(Number(v))} options={RANGES} />
                </div>
                <Bell_ />
                <div className="flex items-center gap-2 border-l border-line pl-2 sm:pl-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-burgundy font-bold text-white" aria-hidden>{user.name.charAt(0).toUpperCase()}</span>
                  <div className="hidden text-sm leading-tight sm:block">
                    <p className="max-w-[140px] truncate font-semibold">{user.name}</p>
                    <p className="text-xs text-ink-muted">{user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Manager'}</p>
                  </div>
                  <button onClick={signOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-ink-muted hover:bg-cream-deep hover:text-burgundy"><LogOut className="h-5 w-5" /></button>
                </div>
              </div>
            </header>
            <div className="border-b border-line px-4 py-2 sm:hidden">
              <Select label="Date range" value={String(days)} onChange={(v) => setDays(Number(v))} options={RANGES} className="w-full" />
            </div>
            <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">{children}</main>
          </div>
        </div>
      </RangeCtx.Provider>
    </MeCtx.Provider>
  );
}

export { api };
