'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';
import { formatDateDMY } from '@/lib/date';

type CorpRepApiResponse =
  | {
      ok: true;
      companyPartyId: string;
      current:
        | {
            representative: { id: string; effectiveFrom: string };
            person: { id: string; fullName: string; email?: string };
          }
        | null;
      latestRdr: { id: string; status: string; packetId: string } | null;
      latestRequests: Array<{ email: string; status: string; signedAt?: string }>;
    }
  | { ok: false; error?: string };

function date10(v?: string) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 10) : '-';
}

export default function AppointCorporateRepresentativeClient() {
  const router = useRouter();
  const { companyId, client, roles, loading, error, closeHref } = useCompanyContext();

  const directors = useMemo(() => {
    const list = roles?.directors ?? [];
    return list
      .map((d) => ({ id: d.entity.person.id, fullName: d.entity.person.fullName, email: d.entity.person.email ?? '' }))
      .filter((d) => !!d.id);
  }, [roles?.directors]);

  const [repLoading, setRepLoading] = useState(false);
  const [repError, setRepError] = useState<string | null>(null);
  const [repData, setRepData] = useState<Extract<CorpRepApiResponse, { ok: true }> | null>(null);
  const [pickedPersonId, setPickedPersonId] = useState('');
  const [matter, setMatter] = useState('signing documents');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signLinks, setSignLinks] = useState<Array<{ email: string; url: string }> | null>(null);

  async function load() {
    if (!companyId) return;
    setRepError(null);
    setRepLoading(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/corporate-representative`, {
        cache: 'no-store',
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as CorpRepApiResponse | null;
      if (!res?.ok || !j || (j as any).ok !== true) {
        setRepData(null);
        setRepError((j as any)?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      setRepData(j as any);
    } finally {
      setRepLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [companyId]);

  useEffect(() => {
    if (!pickedPersonId && directors.length === 1) setPickedPersonId(directors[0]!.id);
  }, [directors, pickedPersonId]);

  async function submit() {
    if (!companyId) return;
    setSubmitError(null);
    setSignLinks(null);

    const id = pickedPersonId.trim();
    if (!id) {
      setSubmitError('INVALID_INPUT');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/corporate-representative`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ representativePersonId: id, matter }),
      }).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!res?.ok || !j?.ok) {
        setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      const links = Array.isArray(j?.signLinks) ? (j.signLinks as Array<{ email: string; url: string }>) : null;
      setSignLinks(links);
      await load();

      const rdrId = String(j?.rdrId ?? '').trim();
      if (rdrId) {
        try {
          if (links?.length) window.sessionStorage.setItem(`gos.tmp.rdrSignLinks.${rdrId}`, JSON.stringify(links));
        } catch {
          void 0;
        }
        router.push(`/corporate-secretary/applications/corporate-representative/${encodeURIComponent(rdrId)}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Appointment of (GLOBAL) Corporate Representative" closeHref={closeHref}>
      {loading ? <div className="text-sm text-black/50">Loading company...</div> : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {!loading && !error ? (
        <>
          <div className="text-sm text-black/60">Company</div>
          <div className="mt-1 text-lg font-semibold">{client?.name ?? '-'}</div>

          <div className="mt-6 rounded-xl bg-white border border-black/5 p-5">
            <div className="text-sm font-semibold">Corporate Representative</div>
            <div className="mt-1 text-xs text-black/50">Maintain a single GLOBAL corporate representative for signing documents.</div>

            {repLoading ? <div className="mt-3 text-sm text-black/50">Loading...</div> : null}
            {repError ? <div className="mt-3 text-sm text-red-600">{repError}</div> : null}

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg bg-black/[0.02] border border-black/5 p-4">
                <div className="text-sm font-medium">Current</div>
                {repData?.current ? (
                  <div className="mt-2 text-sm">
                    <div className="text-black/80">{repData.current.person.fullName}</div>
                    <div className="text-black/60">{repData.current.person.email ?? '-'}</div>
                    <div className="mt-2 text-xs text-black/50">{`Effective: ${formatDateDMY(
                      date10(repData.current.representative.effectiveFrom),
                    )}`}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-black/50">No representative</div>
                )}

                <div className="mt-4">
                  <div className="text-sm text-black/70">Pick a director as representative</div>
                  <select
                    value={pickedPersonId}
                    onChange={(e) => setPickedPersonId(e.target.value)}
                    disabled={submitting || directors.length === 0}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  >
                    <option value="">Select...</option>
                    {directors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName}
                      </option>
                    ))}
                  </select>
                  {directors.length === 0 ? <div className="mt-2 text-xs text-red-600">No directors found</div> : null}
                </div>

                <div className="mt-3">
                  <div className="text-sm text-black/70">Matters</div>
                  <input
                    value={matter}
                    onChange={(e) => setMatter(e.target.value)}
                    disabled={submitting}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    placeholder="e.g. share transfer, change of company name"
                  />
                </div>

                {submitError ? <div className="mt-3 text-sm text-red-600">{submitError}</div> : null}

                <div className="mt-4 flex items-center justify-end">
                  <button
                    onClick={() => void submit()}
                    disabled={submitting || !pickedPersonId}
                    className="rounded-full bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {submitting ? 'Creating...' : 'Appoint / Change'}
                  </button>
                </div>

                {signLinks ? (
                  <div className="mt-4">
                    <div className="text-sm font-medium">Signing links</div>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-sm">
                      {signLinks.map((l) => (
                        <div key={l.email} className="break-words">
                          <span className="text-black/60">{l.email}</span>
                          <span className="text-black/40">{' — '}</span>
                          <a className="text-[#2f7bdc] hover:underline" href={l.url} target="_blank" rel="noreferrer">
                            {l.url}
                          </a>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-black/50">Links are shown only once. In production, signers use email.</div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg bg-black/[0.02] border border-black/5 p-4">
                <div className="text-sm font-medium">Latest Appointment</div>
                {repData?.latestRdr ? (
                  <div className="mt-2 text-sm text-black/70">
                    <div>{`Status: ${repData.latestRdr.status}`}</div>
                    <div className="mt-2">
                      {repData.latestRequests.length ? (
                        <div className="grid grid-cols-1 gap-1">
                          {repData.latestRequests.map((r) => (
                            <div key={r.email} className="flex items-center justify-between gap-3">
                              <div className="truncate" title={r.email}>
                                {r.email}
                              </div>
                              <div className="text-xs text-black/50">{r.status}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-black/50">No signers</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-black/50">No appointment yet</div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </ModalShell>
  );
}
