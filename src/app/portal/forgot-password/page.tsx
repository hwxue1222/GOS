'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PortalForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canRequest = useMemo(() => !!email.trim(), [email]);
  const canConfirm = useMemo(() => !!email.trim() && !!code.trim() && password.trim().length >= 6, [code, email, password]);

  async function requestCode() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, mode: 'portal' }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) {
        setError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      setSent(true);
      setStep('confirm');
    } catch {
      setError('NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  async function confirmReset() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code, password, mode: 'portal' }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) {
        setError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      router.replace('/portal/login');
    } catch {
      setError('NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rounded-xl border border-black/10 dark:border-white/10 p-6">
        <h1 className="text-xl font-semibold">Reset password / 重设密码</h1>
        <p className="text-sm opacity-70 mt-1">输入邮箱获取验证码，然后设置新密码</p>

        <label className="block mt-6 text-sm">
          <div className="opacity-80">Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 outline-none"
            placeholder="Email"
            autoComplete="username"
          />
        </label>

        {step === 'confirm' ? (
          <>
            <label className="block mt-4 text-sm">
              <div className="opacity-80">Code / 验证码</div>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-2 w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 outline-none"
                placeholder="6-digit code"
                inputMode="numeric"
              />
            </label>

            <label className="block mt-4 text-sm">
              <div className="opacity-80">New password / 新密码</div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 outline-none"
                placeholder="At least 6 characters"
                type="password"
              />
            </label>
          </>
        ) : null}

        {error ? <div className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
        {sent && !error ? <div className="mt-4 text-sm text-black/70">Code sent. / 验证码已发送</div> : null}

        <div className="mt-6 grid grid-cols-1 gap-2">
          {step === 'request' ? (
            <button
              disabled={loading || !canRequest}
              onClick={requestCode}
              className="w-full rounded-lg bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {loading ? 'Sending...' : 'Send code / 发送验证码'}
            </button>
          ) : (
            <button
              disabled={loading || !canConfirm}
              onClick={confirmReset}
              className="w-full rounded-lg bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {loading ? 'Resetting...' : 'Reset password / 重设密码'}
            </button>
          )}

          <button
            type="button"
            onClick={() => router.replace('/portal/login')}
            className="w-full rounded-lg border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium"
          >
            Back to login / 返回登录
          </button>
        </div>
      </div>
    </main>
  );
}

