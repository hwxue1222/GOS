'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type CurrentUser = { id: string; name: string; email: string };

type Props = { initialUser: CurrentUser };

function toMessage(code: string) {
  if (code === 'NAME_TAKEN') return '名字已被使用，请换一个名字。';
  if (code === 'EMAIL_TAKEN') return '邮箱已被使用，请换一个邮箱。';
  if (code === 'INVALID_PASSWORD') return '当前密码错误。';
  if (code === 'INVALID_INPUT') return '请检查输入内容。';
  return code;
}

export default function ProfileClient({ initialUser }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialUser.name);
  const [email, setEmail] = useState(initialUser.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const hasProfileChange = useMemo(() => {
    return name.trim() !== initialUser.name || email.trim() !== initialUser.email;
  }, [email, initialUser.email, initialUser.name, name]);

  const wantsPassword = useMemo(() => newPassword.length > 0 || confirmPassword.length > 0 || currentPassword.length > 0, [
    confirmPassword.length,
    currentPassword.length,
    newPassword.length,
  ]);

  async function onSave() {
    setError(null);
    setOk(false);

    const patch: Record<string, string> = {};
    if (hasProfileChange) {
      const n = name.trim();
      const e = email.trim();
      if (!n || !e) {
        setError('INVALID_INPUT');
        return;
      }
      patch.name = n;
      patch.email = e;
    }

    if (wantsPassword) {
      if (!currentPassword || !newPassword) {
        setError('请填写当前密码与新密码。');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('两次输入的新密码不一致。');
        return;
      }
      patch.currentPassword = currentPassword;
      patch.newPassword = newPassword;
    }

    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setError(toMessage(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`));
        return;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; user?: CurrentUser } | null;
      if (j?.user) {
        setOk(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-white border border-black/5 p-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Account</div>
        <button onClick={() => router.back()} className="text-sm text-[#2f7bdc] hover:underline">
          Back
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <div className="text-black/70">Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            autoComplete="name"
          />
        </label>
        <label className="text-sm">
          <div className="text-black/70">Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            autoComplete="email"
          />
        </label>
      </div>

      <div className="mt-6 border-t border-black/5 pt-6">
        <div className="text-sm font-medium">Change password</div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <label className="text-sm">
            <div className="text-black/70">Current password</div>
            <input
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label className="text-sm">
            <div className="text-black/70">New password</div>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              type="password"
              autoComplete="new-password"
            />
          </label>
          <label className="text-sm">
            <div className="text-black/70">Password confirmation</div>
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              type="password"
              autoComplete="new-password"
            />
          </label>
        </div>
      </div>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      {ok ? <div className="mt-4 text-sm text-[#46b35a]">Updated.</div> : null}

      <div className="mt-6 flex items-center justify-end">
        <button
          disabled={saving}
          onClick={onSave}
          className="rounded-md bg-[#46b35a] text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saving ? 'Updating...' : 'Update'}
        </button>
      </div>
    </div>
  );
}

