'use client';

import { useState } from 'react';

type Props = {
  me: { id: string; name: string; email: string; role: 'owner' | 'manager' | 'staff' };
};

export default function SettingsClient({ me }: Props) {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function runMigration() {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch('/api/me/migrate-manager-jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setMsg(j?.error ?? 'FAILED');
        return;
      }
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; migratedJobIds?: string[]; fromUserIds?: string[] }
        | null;
      const n = j?.migratedJobIds?.length ?? 0;
      setMsg(`Migrated ${n} jobs`);
    } finally {
      setRunning(false);
    }
  }

  const show = me.role === 'manager' || me.role === 'owner';

  return (
    <div className="mt-4 rounded-xl bg-white border border-black/5 p-6 text-sm">
      <div className="text-black/60">Account: {me.name}</div>

      {show ? (
        <div className="mt-4">
          <button
            onClick={runMigration}
            disabled={running}
            className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm hover:bg-black/[0.03] disabled:opacity-60"
          >
            {running ? 'Fixing...' : 'Fix my jobs complete permission'}
          </button>
          {msg ? <div className="mt-2 text-sm text-black/60">{msg}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

