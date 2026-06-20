'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Mode = 'portal' | 'admin';

type Props = {
  mode: Mode;
  title: string;
  subtitle: string;
  defaultFrom: string;
};

export default function LoginFormClient({ mode, title, subtitle, defaultFrom }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const from = useMemo(() => params.get('from') ?? defaultFrom, [defaultFrom, params]);

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function waitForSession(maxMs = 2500) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const res = await fetch('/api/me', { cache: 'no-store' }).catch(() => null);
      if (res?.ok) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.ok) return;
        if (mode === 'portal') router.replace('/dashboard');
        else router.replace('/jobs');
      })
      .catch(() => {});
  }, [mode, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      await waitForSession();
      const me = await fetch('/api/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const role = me?.user?.role as string | undefined;
      if (mode === 'portal' && role !== 'client') {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
        setError('PLEASE_USE_COMPANY_ACCOUNT');
        return;
      }
      if (mode === 'admin' && role === 'client') {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
        setError('PLEASE_USE_STAFF_ACCOUNT');
        return;
      }
      if (mode === 'portal') {
        router.replace(role === 'client' ? from : '/jobs');
      } else {
        router.replace(role === 'client' ? '/dashboard' : from);
      }
    } catch {
      setError('NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-black/10 dark:border-white/10 p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm opacity-70 mt-1">{subtitle}</p>

        <label className="block mt-6 text-sm">
          <div className="opacity-80">{mode === 'portal' ? 'Email' : 'Account'}</div>
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="mt-2 w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 outline-none"
            placeholder={mode === 'portal' ? 'Email' : 'Name or email'}
            autoComplete="username"
          />
        </label>

        <label className="block mt-4 text-sm">
          <div className="opacity-80">Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 outline-none"
            placeholder="••••••"
            type="password"
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <div className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error === 'PLEASE_USE_COMPANY_ACCOUNT'
              ? '请使用公司账号登录前台（Portal）'
              : error === 'PLEASE_USE_STAFF_ACCOUNT'
                ? '请使用员工账号登录后台（Admin）'
                : error}
          </div>
        ) : null}

        <button
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {loading ? '登录中...' : '登录'}
        </button>

        <div className="mt-3 text-sm">
          <button
            type="button"
            onClick={() => router.push(mode === 'portal' ? '/portal/forgot-password' : '/admin/forgot-password')}
            className="text-black/70 hover:text-black underline underline-offset-4"
          >
            Forgot password? / 忘记密码
          </button>
        </div>
      </form>
    </main>
  );
}
