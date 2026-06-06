'use client';

import { useMemo, useState } from 'react';

type Props = {
  clientId: string;
  directors: Array<{ roleId: string; fullName: string; email?: string }>;
  onSubmitted: (signLinksText: string | null) => void;
};

export default function DirectorChangeRequestForm({ clientId, directors, onSubmitted }: Props) {
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  const [removeRoleIds, setRemoveRoleIds] = useState<string[]>([]);
  const [addRows, setAddRows] = useState<Array<{ fullName: string; email: string }>>([{ fullName: '', email: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const hasAdds = addRows.some((r) => r.fullName.trim());
    const hasRemoves = removeRoleIds.length > 0;
    return !!effectiveDate.trim() && (hasAdds || hasRemoves);
  }, [addRows, effectiveDate, removeRoleIds.length]);

  async function submit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        effectiveDate: effectiveDate.trim(),
        message: message.trim() || undefined,
        removeDirectorRoleIds: removeRoleIds,
        addDirectors: addRows
          .map((r) => ({ fullName: r.fullName.trim(), email: r.email.trim() || undefined }))
          .filter((r) => !!r.fullName),
      };
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(clientId)}/director-change-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!res?.ok) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      const signLinksText = Array.isArray(j?.signLinks)
        ? (j.signLinks as Array<{ email: string; url: string }>).map((x) => `${x.email} — ${x.url}`).join('\n')
        : null;
      setRemoveRoleIds([]);
      setAddRows([{ fullName: '', email: '' }]);
      setMessage('');
      onSubmitted(signLinksText);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-[#f8fafc] border border-black/5 p-4">
      <div className="text-sm font-medium">New director change request</div>
      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">
          <div className="text-black/70">Effective date</div>
          <input
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
        </label>
        <div className="text-sm">
          <div className="text-black/70">Remove directors</div>
          <div className="mt-2 space-y-1">
            {directors.length ? (
              directors.map((d) => {
                const checked = removeRoleIds.includes(d.roleId);
                return (
                  <label key={d.roleId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setRemoveRoleIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(d.roleId);
                          else next.delete(d.roleId);
                          return Array.from(next);
                        })
                      }
                    />
                    <span className="text-black/70">{d.fullName}</span>
                    {d.email ? <span className="text-xs text-black/40">{d.email}</span> : null}
                  </label>
                );
              })
            ) : (
              <div className="text-xs text-black/50">No directors</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-black/70 text-sm">Add directors</div>
        <div className="mt-2 space-y-2">
          {addRows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <input
                value={r.fullName}
                onChange={(e) =>
                  setAddRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], fullName: e.target.value };
                    return next;
                  })
                }
                placeholder="Full name"
                className="md:col-span-2 rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
              <input
                value={r.email}
                onChange={(e) =>
                  setAddRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], email: e.target.value };
                    return next;
                  })
                }
                placeholder="Email"
                className="md:col-span-2 rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
              <button
                disabled={saving || addRows.length <= 1}
                onClick={() => setAddRows((prev) => prev.filter((_, i) => i !== idx))}
                className="rounded-lg bg-white border border-black/10 text-black/70 px-3 py-2 text-sm disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            disabled={saving}
            onClick={() => setAddRows((prev) => [...prev, { fullName: '', email: '' }])}
            className="rounded-lg bg-white border border-black/10 text-black/70 px-3 py-2 text-sm disabled:opacity-60"
          >
            Add row
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-black/70 text-sm">Message (optional)</div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          rows={3}
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          disabled={!canSubmit || saving}
          onClick={() => void submit()}
          className="rounded-md bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saving ? 'Submitting...' : 'Submit & send to directors'}
        </button>
      </div>
    </div>
  );
}

