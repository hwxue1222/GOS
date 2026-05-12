'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const from = useMemo(() => params.get('from') ?? '/jobs', [params]);

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.ok) router.replace('/jobs');
      })
      .catch(() => {});
  }, [router]);

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
      router.replace(from);
    } catch {
      setError('NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-black/10 dark:border-white/10 p-6"
      >
        <h1 className="text-xl font-semibold">GOS 登录</h1>
        <p className="text-sm opacity-70 mt-1">请使用你的员工账号登录</p>

        <label className="block mt-6 text-sm">
          <div className="opacity-80">Account</div>
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="mt-2 w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 outline-none"
            placeholder="Name or email"
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
          <div className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : null}

        <button
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  );
}
