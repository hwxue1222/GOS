'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  meRole: 'owner' | 'manager' | 'staff';
};

export default function SettingsClient({ meRole }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function clearData() {
    if (meRole !== 'owner') return;
    const ok = window.confirm('Clear all clients, jobs and tasks? This cannot be undone.');
    if (!ok) return;
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/clear-data', { method: 'POST' }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setMsg(j?.error ?? 'FAILED');
        return;
      }
      setMsg('Cleared');
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-white border border-black/5 p-6 text-sm">
      <div className="text-black/70 font-medium">Data</div>
      <div className="mt-1 text-black/60">Prepare for importing client/job/task lists.</div>

      {meRole === 'owner' ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={clearData}
            disabled={running}
            className="rounded-lg border border-red-200 bg-white text-red-600 px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-60"
          >
            {running ? 'Clearing...' : 'Clear data'}
          </button>
          {msg ? <div className="text-sm text-black/60">{msg}</div> : null}
        </div>
      ) : (
        <div className="mt-4 text-sm text-black/50">Only owner can clear data.</div>
      )}
    </div>
  );
}

