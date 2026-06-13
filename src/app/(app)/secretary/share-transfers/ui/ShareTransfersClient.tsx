'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DateInputDMY } from '@/components/DateInputDMY';
import { formatDateDMY } from '@/lib/date';
import { maskAddress, maskDob, maskEmail, maskName, maskNationality } from '@/lib/mask';
import { usePersistedState } from '@/lib/usePersistedState';

type ClientLite = { id: string; code: string; name: string };

type ShareTransfer = {
  id: string;
  clientId: string;
  transferorPartyId: string;
  transfereePartyId: string;
  shareClass?: string;
  shares: number;
  valueSgd?: number;
  effectiveDate: string;
  status: string;
  staPacketId: string;
  brPacketId: string;
  blockingRdrIds?: string[];
  createdAt: string;
};

const SHARE_CLASS_OPTIONS = ['ORDINARY SHARE', 'PREFERENCE SHARE'] as const;

const ID_TYPE_LABEL_BY_VALUE: Record<string, string> = {
  PASSPORT: 'passport no',
  NRIC: 'nric no',
  FIN: 'fin no',
  IC: 'ic no',
};

function maskPhoneLoose(phone: string) {
  const raw = String(phone ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '*'.repeat(Math.max(6, raw.length));
  if (digits.length <= 4) return '*'.repeat(digits.length);
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  return `${head}${'*'.repeat(Math.max(2, digits.length - 4))}${tail}`;
}

function isSingaporeCompanyRegistrationNo(regNo: string) {
  const v = String(regNo ?? '').trim();
  return /^\d{9}[A-Za-z]$/.test(v);
}

type NewShareholderKind = 'PERSON' | 'COMPANY';
type NewShareholderPerson = {
  fullName: string;
  idType: 'PASSPORT' | 'NRIC' | 'FIN' | 'IC';
  idNo: string;
  dob: string;
  email: string;
  phone: string;
  nationality: string;
  address: string;
};

type NewShareholderCompany = {
  clientId: string;
  companyName: string;
  registrationNo: string;
  registrationCountry: string;
  address: string;
  email: string;
  phone: string;
  corporateRepresentativeName: string;
  corporateRepresentativeEmail: string;
  directorSignerName: string;
  directorSignerEmail: string;
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
    valueSgd: '',
    shareClass: 'ORDINARY SHARE',
    transferorPartyId: '',
    transfereeMode: 'EXISTING' as 'EXISTING' | 'NEW',
    transfereePartyId: '',
    newShareholderKind: 'PERSON' as NewShareholderKind,
    newPersonLockedFromLookup: false,
    newPerson: {
      fullName: '',
      idType: 'PASSPORT' as NewShareholderPerson['idType'],
      idNo: '',
      dob: '',
      email: '',
      phone: '',
      nationality: '',
      address: '',
    },
    newCompanyLockedFromLookup: false,
    newCompany: {
      clientId: '',
      companyName: '',
      registrationNo: '',
      registrationCountry: '',
      address: '',
      email: '',
      phone: '',
      corporateRepresentativeName: '',
      corporateRepresentativeEmail: '',
      directorSignerName: '',
      directorSignerEmail: '',
    },
  });

  useEffect(() => {
    if (!lockedClientId) return;
    setDraft((v) => ({ ...v, clientId: lockedClientId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedClientId]);

  const [shareholders, setShareholders] = useState<ShareholderOption[]>([]);
  const [loadingShareholders, setLoadingShareholders] = useState(false);

  useEffect(() => {
    if (draft.transfereeMode !== 'NEW') return;
    if (draft.newShareholderKind !== 'PERSON') return;

    const idNo = String(draft.newPerson.idNo ?? '').trim();
    if (!idNo) return;
    const idTypeLabel = ID_TYPE_LABEL_BY_VALUE[draft.newPerson.idType] ?? '';

    const t = window.setTimeout(() => {
      fetch(`/api/portal/people-lookup?idNo=${encodeURIComponent(idNo)}&idTypeLabel=${encodeURIComponent(idTypeLabel)}`, {
        cache: 'no-store',
      })
        .then((r) => r.json().catch(() => null))
        .then((j: any) => {
          const p = j?.person;
          if (!p) return;
          setDraft((v) => ({
            ...v,
            newPerson: {
              ...v.newPerson,
              fullName: String(p.fullName ?? v.newPerson.fullName),
              email: String(p.email ?? v.newPerson.email),
              phone: String(p.phone ?? v.newPerson.phone),
              nationality: String(p.nationality ?? v.newPerson.nationality),
              dob: String(p.dob ?? v.newPerson.dob),
              address: String(p.address ?? v.newPerson.address),
            },
            newPersonLockedFromLookup: true,
          }));
        })
        .catch(() => null);
    }, 250);
    return () => window.clearTimeout(t);
  }, [draft.transfereeMode, draft.newShareholderKind, draft.newPerson.idType, draft.newPerson.idNo]);

  useEffect(() => {
    if (draft.transfereeMode !== 'NEW') return;
    if (draft.newShareholderKind !== 'COMPANY') return;
    const regNo = String(draft.newCompany.registrationNo ?? '').trim();
    if (!regNo) return;

    if (!draft.newCompanyLockedFromLookup && !draft.newCompany.registrationCountry.trim() && isSingaporeCompanyRegistrationNo(regNo)) {
      setDraft((v) => ({
        ...v,
        newCompany: { ...v.newCompany, registrationCountry: 'Singapore' },
      }));
    }

    const t = window.setTimeout(() => {
      fetch(`/api/portal/company-lookup?registrationNo=${encodeURIComponent(regNo)}`, { cache: 'no-store' })
        .then((r) => r.json().catch(() => null))
        .then((j: any) => {
          const c = j?.company;
          if (!c) {
            setDraft((v) => ({
              ...v,
              newCompany: {
                ...v.newCompany,
                clientId: '',
              },
              newCompanyLockedFromLookup: false,
            }));
            return;
          }
          const addr = String(c.registeredOfficeAddress ?? c.address ?? '').trim();
          const inferredCountry =
            String(c.countryOfBusinessRegistration ?? '').trim() || (isSingaporeCompanyRegistrationNo(regNo) ? 'Singapore' : '');
          setDraft((v) => ({
            ...v,
            newCompany: {
              ...v.newCompany,
              clientId: String(c.clientId ?? ''),
              companyName: String(c.name ?? v.newCompany.companyName),
              address: addr || v.newCompany.address,
              email: String(c.email ?? v.newCompany.email),
              phone: String(c.phone ?? v.newCompany.phone),
              registrationCountry: inferredCountry || v.newCompany.registrationCountry,
            },
            newCompanyLockedFromLookup: true,
          }));
        })
        .catch(() => null);
    }, 250);
    return () => window.clearTimeout(t);
  }, [draft.transfereeMode, draft.newShareholderKind, draft.newCompany.registrationNo]);

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
      newShareholderKind: 'PERSON',
      newPersonLockedFromLookup: false,
      newPerson: {
        fullName: '',
        idType: 'PASSPORT',
        idNo: '',
        dob: '',
        email: '',
        phone: '',
        nationality: '',
        address: '',
      },
      newCompanyLockedFromLookup: false,
      newCompany: {
        clientId: '',
        companyName: '',
        registrationNo: '',
        registrationCountry: '',
        address: '',
        email: '',
        phone: '',
        corporateRepresentativeName: '',
        corporateRepresentativeEmail: '',
        directorSignerName: '',
        directorSignerEmail: '',
      },
      valueSgd: '',
      shareClass: 'ORDINARY SHARE',
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
    const valueSgd = Number(draft.valueSgd);
    if (!Number.isFinite(valueSgd) || valueSgd < 0) {
      setError('INVALID_INPUT');
      return;
    }
    if (!draft.transferorPartyId) {
      setError('INVALID_INPUT');
      return;
    }

    if (draft.transfereeMode === 'EXISTING' && draft.transfereePartyId && draft.transfereePartyId === draft.transferorPartyId) {
      setError('INVALID_INPUT');
      return;
    }

    if (draft.transfereeMode === 'EXISTING' && !draft.transfereePartyId) {
      setError('INVALID_INPUT');
      return;
    }
    if (draft.transfereeMode === 'NEW') {
      if (draft.newShareholderKind === 'PERSON') {
        const p = draft.newPerson;
        if (!p.fullName.trim()) return void setError('INVALID_INPUT');
        if (!p.idNo.trim()) return void setError('INVALID_INPUT');
        if (!p.dob.trim()) return void setError('INVALID_INPUT');
        if (!p.email.trim()) return void setError('INVALID_INPUT');
        if (!p.phone.trim()) return void setError('INVALID_INPUT');
        if (!p.nationality.trim()) return void setError('INVALID_INPUT');
        if (!p.address.trim()) return void setError('INVALID_INPUT');
      } else {
        const c = draft.newCompany;
        if (!c.companyName.trim()) return void setError('INVALID_INPUT');
        if (!c.registrationNo.trim()) return void setError('INVALID_INPUT');
        if (!c.address.trim()) return void setError('INVALID_INPUT');
        if (!c.clientId.trim()) {
          if (!c.registrationCountry.trim()) return void setError('INVALID_INPUT');
          if (!c.corporateRepresentativeName.trim()) return void setError('INVALID_INPUT');
          if (!c.corporateRepresentativeEmail.trim()) return void setError('INVALID_INPUT');
          if (!c.directorSignerEmail.trim()) return void setError('INVALID_INPUT');
        }
      }
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
          valueSgd,
          shareClass: draft.shareClass.trim() || undefined,
          transferor: { kind: 'EXISTING_PARTY', partyId: draft.transferorPartyId },
          transferee:
            draft.transfereeMode === 'EXISTING'
              ? { kind: 'EXISTING_PARTY', partyId: draft.transfereePartyId }
              : draft.newShareholderKind === 'PERSON'
                ? {
                    kind: 'NEW_PERSON',
                    fullName: draft.newPerson.fullName,
                    idType: draft.newPerson.idType,
                    idNo: draft.newPerson.idNo,
                    dob: draft.newPerson.dob,
                    email: draft.newPerson.email,
                    phone: draft.newPerson.phone,
                    nationality: draft.newPerson.nationality,
                    address: draft.newPerson.address,
                  }
                : draft.newCompany.clientId.trim()
                  ? {
                      kind: 'COMPANY_CLIENT',
                      clientId: draft.newCompany.clientId.trim(),
                    }
                  : {
                      kind: 'NEW_COMPANY',
                      companyName: draft.newCompany.companyName,
                      registrationNo: draft.newCompany.registrationNo,
                      registrationCountry: draft.newCompany.registrationCountry,
                      address: draft.newCompany.address,
                      email: draft.newCompany.email,
                      phone: draft.newCompany.phone,
                      corporateRepresentativeName: draft.newCompany.corporateRepresentativeName,
                      corporateRepresentativeEmail: draft.newCompany.corporateRepresentativeEmail,
                      directorSignerName: draft.newCompany.directorSignerName,
                      directorSignerEmail: draft.newCompany.directorSignerEmail,
                    },
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
            <div className="mt-3">
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
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg bg-white border border-black/5 p-4">
                <div className="text-sm font-medium">Transferor</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="text-black/70">Effective date</div>
                    <DateInputDMY
                      value={draft.effectiveDate}
                      onChange={(next) => setDraft((v) => ({ ...v, effectiveDate: next }))}
                      inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Number of share transferred</div>
                    <input
                      type="number"
                      value={draft.shares || ''}
                      onChange={(e) => setDraft((v) => ({ ...v, shares: Number(e.target.value) }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Transfer price</div>
                    <div className="mt-1 flex">
                      <div className="rounded-l-lg border border-black/10 bg-white px-3 py-2 text-sm text-black/70">S$</div>
                      <input
                        type="number"
                        step="0.01"
                        value={draft.valueSgd}
                        onChange={(e) => setDraft((v) => ({ ...v, valueSgd: e.target.value }))}
                        className="w-full rounded-r-lg border border-black/10 border-l-0 px-3 py-2 text-sm"
                      />
                    </div>
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Share class</div>
                    <select
                      value={draft.shareClass}
                      onChange={(e) => setDraft((v) => ({ ...v, shareClass: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    >
                      {SHARE_CLASS_OPTIONS.map((x) => (
                        <option key={x} value={x}>
                          {x === 'ORDINARY SHARE' ? 'Ordinary share' : 'Preference share'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3">
                  <label className="text-sm block">
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
                      {shareholders
                        .filter((s) => s.partyId !== draft.transferorPartyId)
                        .map((s) => (
                          <option key={s.partyId} value={s.partyId}>
                            {s.label}
                          </option>
                        ))}
                      <option value="__NEW__">New Shareholder</option>
                    </select>
                    {loadingShareholders ? <div className="mt-2 text-xs text-black/50">Loading shareholders...</div> : null}
                  </label>

                  {draft.transfereeMode === 'NEW' ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-3 text-sm text-black/80">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="newShareholderKind"
                            checked={draft.newShareholderKind === 'PERSON'}
                            onChange={() => setDraft((v) => ({ ...v, newShareholderKind: 'PERSON', newPersonLockedFromLookup: false }))}
                          />
                          Individual
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="newShareholderKind"
                            checked={draft.newShareholderKind === 'COMPANY'}
                            onChange={() => setDraft((v) => ({ ...v, newShareholderKind: 'COMPANY', newCompanyLockedFromLookup: false }))}
                          />
                          Corporate
                        </label>
                      </div>

                      {draft.newShareholderKind === 'PERSON' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="text-sm">
                            <div className="text-black/70">Full name</div>
                            <input
                              value={draft.newPersonLockedFromLookup ? maskName(draft.newPerson.fullName) : draft.newPerson.fullName}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newPerson: { ...v.newPerson, fullName: e.target.value },
                                }))
                              }
                              disabled={draft.newPersonLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-black/70">ID No.</div>
                            <div className="mt-1 grid grid-cols-12 gap-2">
                              <select
                                value={draft.newPerson.idType}
                                onChange={(e) =>
                                  setDraft((v) => ({
                                    ...v,
                                    newPerson: {
                                      ...v.newPerson,
                                      idType: e.target.value as NewShareholderPerson['idType'],
                                    },
                                  }))
                                }
                                className="col-span-5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                              >
                                <option value="PASSPORT">Passport</option>
                                <option value="NRIC">NRIC</option>
                                <option value="FIN">FIN</option>
                                <option value="IC">IC</option>
                              </select>
                              <input
                                value={draft.newPerson.idNo}
                                onChange={(e) =>
                                  setDraft((v) => ({
                                    ...v,
                                    newPerson: { ...v.newPerson, idNo: e.target.value },
                                  }))
                                }
                                className="col-span-7 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                              />
                            </div>
                          </label>
                          <label className="text-sm">
                            <div className="text-black/70">Date of birth</div>
                            <input
                              type="date"
                              value={draft.newPersonLockedFromLookup ? maskDob(draft.newPerson.dob) : draft.newPerson.dob}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newPerson: { ...v.newPerson, dob: e.target.value },
                                }))
                              }
                              disabled={draft.newPersonLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-black/70">Email</div>
                            <input
                              value={draft.newPersonLockedFromLookup ? maskEmail(draft.newPerson.email) : draft.newPerson.email}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newPerson: { ...v.newPerson, email: e.target.value },
                                }))
                              }
                              disabled={draft.newPersonLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-black/70">Phone</div>
                            <input
                              value={draft.newPersonLockedFromLookup ? maskPhoneLoose(draft.newPerson.phone) : draft.newPerson.phone}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newPerson: { ...v.newPerson, phone: e.target.value },
                                }))
                              }
                              disabled={draft.newPersonLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-black/70">Nationality</div>
                            <input
                              value={draft.newPersonLockedFromLookup ? maskNationality(draft.newPerson.nationality) : draft.newPerson.nationality}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newPerson: { ...v.newPerson, nationality: e.target.value },
                                }))
                              }
                              disabled={draft.newPersonLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm sm:col-span-2">
                            <div className="text-black/70">Address</div>
                            <textarea
                              value={draft.newPersonLockedFromLookup ? maskAddress(draft.newPerson.address) : draft.newPerson.address}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newPerson: { ...v.newPerson, address: e.target.value },
                                }))
                              }
                              rows={2}
                              disabled={draft.newPersonLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="text-sm">
                            <div className="text-black/70">Company name</div>
                            <input
                              value={draft.newCompany.companyName}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newCompany: { ...v.newCompany, companyName: e.target.value },
                                }))
                              }
                              disabled={draft.newCompanyLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-black/70">Company registration no.</div>
                            <input
                              value={draft.newCompany.registrationNo}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newCompany: { ...v.newCompany, registrationNo: e.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-black/70">Country of business registration</div>
                            <input
                              value={draft.newCompany.registrationCountry}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newCompany: { ...v.newCompany, registrationCountry: e.target.value },
                                }))
                              }
                              disabled={draft.newCompanyLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-black/70">Email</div>
                            <input
                              value={draft.newCompanyLockedFromLookup ? maskEmail(draft.newCompany.email) : draft.newCompany.email}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newCompany: { ...v.newCompany, email: e.target.value },
                                }))
                              }
                              disabled={draft.newCompanyLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm">
                            <div className="text-black/70">Phone</div>
                            <input
                              value={draft.newCompanyLockedFromLookup ? maskPhoneLoose(draft.newCompany.phone) : draft.newCompany.phone}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newCompany: { ...v.newCompany, phone: e.target.value },
                                }))
                              }
                              disabled={draft.newCompanyLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-sm sm:col-span-2">
                            <div className="text-black/70">Address</div>
                            <textarea
                              value={draft.newCompanyLockedFromLookup ? maskAddress(draft.newCompany.address) : draft.newCompany.address}
                              onChange={(e) =>
                                setDraft((v) => ({
                                  ...v,
                                  newCompany: { ...v.newCompany, address: e.target.value },
                                }))
                              }
                              rows={2}
                              disabled={draft.newCompanyLockedFromLookup}
                              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                            />
                          </label>


                          {!draft.newCompany.clientId.trim() ? (
                            <>
                              <label className="text-sm">
                                <div className="text-black/70">Corporate representative name</div>
                                <input
                                  value={draft.newCompany.corporateRepresentativeName}
                                  onChange={(e) =>
                                    setDraft((v) => ({
                                      ...v,
                                      newCompany: { ...v.newCompany, corporateRepresentativeName: e.target.value },
                                    }))
                                  }
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Corporate representative email</div>
                                <input
                                  value={draft.newCompany.corporateRepresentativeEmail}
                                  onChange={(e) =>
                                    setDraft((v) => ({
                                      ...v,
                                      newCompany: { ...v.newCompany, corporateRepresentativeEmail: e.target.value },
                                    }))
                                  }
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Director signer name</div>
                                <input
                                  value={draft.newCompany.directorSignerName}
                                  onChange={(e) =>
                                    setDraft((v) => ({
                                      ...v,
                                      newCompany: { ...v.newCompany, directorSignerName: e.target.value },
                                    }))
                                  }
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Director signer email</div>
                                <input
                                  value={draft.newCompany.directorSignerEmail}
                                  onChange={(e) =>
                                    setDraft((v) => ({
                                      ...v,
                                      newCompany: { ...v.newCompany, directorSignerEmail: e.target.value },
                                    }))
                                  }
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                            </>
                          ) : null}
                        </div>
                      )}
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
                      <div>{t.shares}</div>
                      {typeof t.valueSgd === 'number' && Number.isFinite(t.valueSgd) ? (
                        <div className="text-xs text-black/50">S${t.valueSgd}</div>
                      ) : null}
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
