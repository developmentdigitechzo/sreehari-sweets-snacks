'use client';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

type T = { id: number; kind: 'ok' | 'bad'; text: string };
let items: T[] = [];
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function toast(text: string, kind: 'ok' | 'bad' = 'ok') {
  const t = { id: ++seq, kind, text };
  items = [...items, t].slice(-4);
  emit();
  setTimeout(() => dismiss(t.id), kind === 'bad' ? 7000 : 3500);
}
const dismiss = (id: number) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

export function ToastHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border bg-white px-4 py-3 text-sm shadow-card ${t.kind === 'ok' ? 'border-ok/30' : 'border-bad/40'}`}>
          {t.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />}
          <span className="flex-1 text-ink">{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
