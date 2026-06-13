'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DateInputDMY } from '@/components/DateInputDMY';
import { formatDateDMY } from '@/lib/date';
import { usePersistedState } from '@/lib/usePersistedState';

type ClientLite = { id: string; code: string; name: string };

type ShareTransfer = {
  id: string;
  clientId: string;
  transferorPartyId: string;
  transfereePartyId: string;
  shareClass?: string;
  shares: number;
  effectiveDate: string;
  status: string;
  staPacketId: string;
  brPacketId: string;
  blockingRdrIds?: string[];
  createdAt: string;
};

type ShareholderOption = {
  partyId: string;
  label: string;
  sharesHeld: number;
};

export default function ShareTransfersClient(props: {
  initialClients: ClientLite[];
  initialTransfers: ShareTransfer[];
  initialClientId?: string;
}) {
  const { initialClients, initialTransfers, initialClientId } = props;

  const [clients] = useState<ClientLite[]>(initialClients);
  const [transfers, setTransfers] = useState<ShareTransfer[]>(initialTransfers);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = usePersistedState('gos.secretary.shareTransfers.search', '');

  const lockedClientId = String(initialClientId ?? '').trim();
  const [draft, setDraft] = useState({
    clientId: lockedClientId || clients[0]?.id || '',
    effectiveDate: '',
    shares: 0,
    shareClass: '',
    transferorPartyId: '',
    transfereeMode: 'EXISTING' as 'EXISTING' | 'NEW',
    transfereePartyId: '',
    transfereeName: '',
    transfereeEmail: '',
  });

  useEffect(() => {
    if (!lockedClientId) return;
    setDraft((v) => ({ ...v, clientId: lockedClientId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedClientId]);

  const [shareholders, setShareholders] = useState<ShareholderOption[]>([]);
  const [loadingShareholders, setLoadingShareholders] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const clientId = draft.clientId;
      if (!clientId) {
        if (!ignore) setShareholders([]);
        return;
      }
      setLoadingShareholders(true);
      try {
        const res = await fetch(`/api/secretary/companies/${encodeURIComponent(clientId)}`, { cache: 'no-store' }).catch(() => null);
        if (!res?.ok) {
          if (!ignore) setShareholders([]);
          return;
        }
        const j = (await res.json().catch(() => null)) as { ok?: boolean; roles?: { shareholders?: any[] } } | null;
        const rows = Array.isArray(j?.roles?.shareholders) ? (j!.roles!.shareholders as any[]) : [];
        const opts: ShareholderOption[] = rows
          .map((r) => {
            const partyId = String(r?.role?.partyId ?? '').trim();
            const sharesHeld = Number(r?.role?.shares);
            if (!partyId || !Number.isFinite(sharesHeld)) return null;
            const entity = r?.entity;
            const name =
              entity?.type === 'PERSON'
                ? String(entity?.person?.fullName ?? '').trim()
                : entity?.type === 'COMPANY'
                  ? String(entity?.company?.name ?? '').trim()
                  : '';
            if (!name) return null;
            const kindLabel = entity?.type === 'COMPANY' ? 'Corporate' : 'Individual';
            const label = `${name} (${kindLabel} shareholder Number of shares held: ${sharesHeld.toLocaleString()})`;
            return { partyId, label, sharesHeld };
          })
          .filter(Boolean) as ShareholderOption[];

        opts.sort((a, b) => b.sharesHeld - a.sharesHeld || a.label.localeCompare(b.label));
        if (!ignore) setShareholders(opts);
      } finally {
        if (!ignore) setLoadingShareholders(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [draft.clientId]);

  useEffect(() => {
    if (!draft.clientId) return;
    setDraft((v) => ({
      ...v,
      transferorPartyId: '',
      transfereePartyId: '',
      transfereeMode: 'EXISTING',
      transfereeName: '',
      transfereeEmail: '',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.clientId]);

  const visibleTransfers = useMemo(() => {
    return lockedClientId ? transfers.filter((t) => t.clientId === lockedClientId) : transfers;
  }, [lockedClientId, transfers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleTransfers;
    return visibleTransfers.filter((t) => `${t.id} ${t.status}`.toLowerCase().includes(q));
  }, [search, visibleTransfers]);

  async function refresh() {
    const res = await fetch('/api/secretary/share-transfers');
    const j = await res.json().catch(() => null);
    if (res.ok && Array.isArray(j?.transfers)) setTransfers(j.transfers);
  }

  async function create() {
    setError(null);
    setInfo(null);
    if (!draft.clientId) {
      setError('INVALID_INPUT');
      return;
    }
    if (!draft.effectiveDate) {
      setError('INVALID_INPUT');
      return;
    }
    if (!draft.shares || draft.shares <= 0) {
      setError('INVALID_INPUT');
      return;
    }
    if (!draft.transferorPartyId) {
      setError('INVALID_INPUT');
      return;
    }

    if (draft.transfereeMode === 'EXISTING' && !draft.transfereePartyId) {
      setError('INVALID_INPUT');
      return;
    }
    if (draft.transfereeMode === 'NEW' && (!draft.transfereeName.trim() || !draft.transfereeEmail.trim())) {
      setError('INVALID_INPUT');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/secretary/share-transfers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId: draft.clientId,
          effectiveDate: draft.effectiveDate,
          shares: draft.shares,
          shareClass: draft.shareClass || undefined,
          transferor: { kind: 'EXISTING_PARTY', partyId: draft.transferorPartyId },
          transferee:
            draft.transfereeMode === 'EXISTING'
              ? { kind: 'EXISTING_PARTY', partyId: draft.transfereePartyId }
              : { kind: 'PERSON', fullName: draft.transfereeName, email: draft.transfereeEmail },
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      if (j?.transfer) {
        setTransfers((prev) => [j.transfer as ShareTransfer, ...prev]);
        setInfo(
          j.transfer.status === 'BLOCKED_REPRESENTATIVE'
            ? 'BLOCKED_REPRESENTATIVE: complete corporate representative appointment first.'
            : 'CREATED',
        );
      }
      if (Array.isArray(j?.signLinks?.br) || Array.isArray(j?.signLinks?.sta) || Array.isArray(j?.signLinks?.rdr)) {
        const all: Array<{ email: string; url: string }> = [
          ...(j?.signLinks?.br ?? []),
          ...(j?.signLinks?.sta ?? []),
          ...(j?.signLinks?.rdr ?? []),
        ];
        const lines = all.map((x) => `${x.email} — ${x.url}`).join('\n');
        if (lines) setInfo((prev) => (prev ? `${prev}\n\n${lines}` : lines));
      }
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function resume(id: string) {
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/secretary/share-transfers/${id}/resume`, { method: 'POST' });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setError(j?.error ?? `HTTP_${res.status}`);
      return;
    }
    if (Array.isArray(j?.signLinks)) {
      const lines = (j.signLinks as Array<{ email: string; url: string }>).map((x) => `${x.email} — ${x.url}`).join('\n');
      if (lines) setInfo(lines);
    }
    await refresh();
  }

  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.id, `${c.code} ${c.name}`])), [clients]);

  return (
    <div className="flex-1">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="rounded-xl bg-white border border-black/5 p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-lg font-semibold">Share Transfers</div>
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-72 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none"
                placeholder="Search"
              />
              <button
                onClick={() => void refresh()}
                className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/[0.02]"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-black/[0.02] border border-black/5 p-4">
            <div className="text-sm font-medium">New Share Transfer</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-sm">
                <div className="text-black/70">Target company</div>
                {lockedClientId ? (
                  <div className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black/80">
                    {clientNameById.get(lockedClientId) ?? lockedClientId}
                  </div>
                ) : (
                  <select
                    value={draft.clientId}
                    onChange={(e) => setDraft((v) => ({ ...v, clientId: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="text-sm">
                <div className="text-black/70">Effective date</div>
                <DateInputDMY
                  value={draft.effectiveDate}
                  onChange={(next) => setDraft((v) => ({ ...v, effectiveDate: next }))}
                  inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/70">Shares</div>
                <input
                  type="number"
                  value={draft.shares || ''}
                  onChange={(e) => setDraft((v) => ({ ...v, shares: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/70">Share class</div>
                <input
                  value={draft.shareClass}
                  onChange={(e) => setDraft((v) => ({ ...v, shareClass: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg bg-white border border-black/5 p-4">
                <div className="text-sm font-medium">Transferor</div>
                <div className="mt-3">
                  <label className="text-sm block">
                    <div className="text-black/70">Shares</div>
                    <select
                      value={draft.transferorPartyId}
                      onChange={(e) => setDraft((v) => ({ ...v, transferorPartyId: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      disabled={loadingShareholders}
                    >
                      <option value="">Select...</option>
                      {shareholders.map((s) => (
                        <option key={s.partyId} value={s.partyId}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    {loadingShareholders ? <div className="mt-2 text-xs text-black/50">Loading shareholders...</div> : null}
                  </label>
                </div>
              </div>

              <div className="rounded-lg bg-white border border-black/5 p-4">
                <div className="text-sm font-medium">Transferee</div>
                <div className="mt-3">
                  <label className="text-sm block">
                    <div className="text-black/70">Shares</div>
                    <select
                      value={draft.transfereeMode === 'NEW' ? '__NEW__' : draft.transfereePartyId}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__NEW__') {
                          setDraft((p) => ({ ...p, transfereeMode: 'NEW', transfereePartyId: '' }));
                        } else {
                          setDraft((p) => ({ ...p, transfereeMode: 'EXISTING', transfereePartyId: v }));
                        }
                      }}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      disabled={loadingShareholders}
                    >
                      <option value="">Select...</option>
                      {shareholders.map((s) => (
                        <option key={s.partyId} value={s.partyId}>
                          {s.label}
                        </option>
                      ))}
                      <option value="__NEW__">New Shareholder</option>
                    </select>
                    {loadingShareholders ? <div className="mt-2 text-xs text-black/50">Loading shareholders...</div> : null}
                  </label>

                  {draft.transfereeMode === 'NEW' ? (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="text-sm">
                        <div className="text-black/70">Name</div>
                        <input
                          value={draft.transfereeName}
                          onChange={(e) => setDraft((v) => ({ ...v, transfereeName: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-sm">
                        <div className="text-black/70">Email</div>
                        <input
                          value={draft.transfereeEmail}
                          onChange={(e) => setDraft((v) => ({ ...v, transfereeEmail: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
            {info ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white border border-black/5 p-3 text-xs text-black/70 overflow-x-auto">
                {info}
              </pre>
            ) : null}

            <div className="mt-4 flex items-center justify-end">
              <button
                disabled={saving}
                onClick={() => void create()}
                className="rounded-full bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white border border-black/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-black/5 text-sm font-medium">Transfers</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-black/60">
                <tr className="border-b border-black/5">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Effective</th>
                  <th className="px-4 py-3 font-medium">Shares</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium w-32"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-black/80">{t.id}</div>
                      <div className="text-xs text-black/50">{formatDateDMY(t.createdAt.slice(0, 10))}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link className="text-[#2f7bdc] hover:underline" href={`/clients/${t.clientId}`}>
                        {clientNameById.get(t.clientId) ?? t.clientId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDateDMY(t.effectiveDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {t.shares}
                      {t.shareClass ? <span className="text-black/50">{` (${t.shareClass})`}</span> : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{t.status}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {t.status === 'BLOCKED_REPRESENTATIVE' ? (
                        <button
                          onClick={() => void resume(t.id)}
                          className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm hover:bg-black/[0.02]"
                        >
                          Resume
                        </button>
                      ) : (
                        <span className="text-black/30">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-black/50">
                      No transfers
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
