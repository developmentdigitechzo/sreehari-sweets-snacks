'use client';
import { isValidEmail } from '@/lib/validate';
import { withBase } from '@/lib/base';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const fe: typeof fieldErr = {};
    if (!isValidEmail(email)) fe.email = 'Enter a valid email address, like name@example.com';
    if (!password) fe.password = 'Enter your password';
    setFieldErr(fe);
    if (fe.email || fe.password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBase('/api/session'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : j?.error?.message ?? 'Sign-in failed');
        setBusy(false);
        return;
      }
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch {
      setError('Network problem. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 rounded-2xl bg-gradient-to-b from-burgundy to-burgundy-dark px-6 py-7 text-center text-white shadow-card">
          <p className="font-serif text-3xl font-bold">Shree Hari<sup className="text-xs">®</sup></p>
          <p className="text-xs tracking-wide text-white/80">— Sweets &amp; Snacks —</p>
          <p className="mt-3 text-sm text-white/90">Store administration</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
          <h1 className="font-serif text-2xl font-bold text-burgundy">Sign in</h1>
          {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-medium text-bad">{error}</p>}
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} aria-describedby={fieldErr.email ? 'email-err' : undefined} />
            {fieldErr.email && <p id="email-err" className="mt-1 text-xs font-medium text-bad">{fieldErr.email}</p>}
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <div className="relative">
              <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" className="input pr-11" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!fieldErr.password} aria-describedby={fieldErr.password ? 'pw-err' : undefined} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-muted hover:bg-cream-deep">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            {fieldErr.password && <p id="pw-err" className="mt-1 text-xs font-medium text-bad">{fieldErr.password}</p>}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Sign in</button>
          <p className="text-center text-xs text-ink-muted">Staff accounts only. Ask a super admin if you need access.</p>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
