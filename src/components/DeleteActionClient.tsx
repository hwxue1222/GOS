'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  deleteUrl: string;
  label?: string;
  confirmText?: string;
  className?: string;
  onDoneHref?: string;
};

export default function DeleteActionClient({ deleteUrl, label, confirmText, className, onDoneHref }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (busy) return;
    const ok = window.confirm(confirmText ?? 'Delete this item?');
    if (!ok) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(deleteUrl, { method: 'DELETE' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res?.ok || !j?.ok) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      if (onDoneHref) {
        router.push(onDoneHref);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onDelete()}
        className={className ?? 'rounded-md bg-white border border-red-200 text-red-700 px-3 py-1.5 text-xs font-medium disabled:opacity-60'}
      >
        {busy ? 'Deleting…' : (label ?? 'Delete')}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

