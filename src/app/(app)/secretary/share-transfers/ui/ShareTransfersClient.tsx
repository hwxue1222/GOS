'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  representativePersonId: string;
  companyName: string;
  registrationNo: string;
  countryOfIncorporation: string;
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
  kind: 'PERSON' | 'COMPANY';
  companyClientId?: string;
};

type ShareTransferDraft = {
  id: string;
  effectiveDate: string;
  shares: number;
  valueSgd: string;
  shareClass: (typeof SHARE_CLASS_OPTIONS)[number];
  transferorPartyId: string;
  transferorRepresentativePersonId: string;
  transfereeMode: 'EXISTING' | 'NEW';
  transfereePartyId: string;
  newShareholderKind: NewShareholderKind;
  newPersonLockedFromLookup: boolean;
  newPerson: NewShareholderPerson;
  newCompanyLockedFromLookup: boolean;
  newCompany: NewShareholderCompany;
};

function makeDraft(): ShareTransferDraft {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return {
    id,
    effectiveDate: '',
    shares: 0,
    valueSgd: '',
    shareClass: 'ORDINARY SHARE',
    transferorPartyId: '',
    transferorRepresentativePersonId: '',
    transfereeMode: 'EXISTING',
    transfereePartyId: '',
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
      representativePersonId: '',
      companyName: '',
      registrationNo: '',
      countryOfIncorporation: '',
      address: '',
      email: '',
      phone: '',
      corporateRepresentativeName: '',
      corporateRepresentativeEmail: '',
      directorSignerName: '',
      directorSignerEmail: '',
    },
  };
}

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
  usePersistedState('gos.secretary.shareTransfers.search', '');

  const lockedClientId = String(initialClientId ?? '').trim();
  const [drafts, setDrafts] = useState<ShareTransferDraft[]>(() => [makeDraft()]);

  const patchDraft = (id: string, patch: Partial<ShareTransferDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const patchDraftPerson = (id: string, patch: Partial<NewShareholderPerson>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, newPerson: { ...d.newPerson, ...patch } } : d)));
  };

  const patchDraftCompany = (id: string, patch: Partial<NewShareholderCompany>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, newCompany: { ...d.newCompany, ...patch } } : d)));
  };

  const [shareholders, setShareholders] = useState<ShareholderOption[]>([]);
  const [loadingShareholders, setLoadingShareholders] = useState(false);

  const [directorsByClientId, setDirectorsByClientId] = useState<
    Record<string, Array<{ personId: string; fullName: string; email: string }>>
  >({});

  const shareholderByPartyId = useMemo(() => {
    const m = new Map<string, ShareholderOption>();
    for (const s of shareholders) m.set(s.partyId, s);
    return m;
  }, [shareholders]);

  const selectedClientId = lockedClientId || clients[0]?.id || '';

  const personLookupKey = useMemo(() => {
    return JSON.stringify(
      drafts.map((d) => [d.id, d.transfereeMode, d.newShareholderKind, d.newPersonLockedFromLookup, d.newPerson.idType, d.newPerson.idNo]),
    );
  }, [drafts]);
  const companyLookupKey = useMemo(() => {
    return JSON.stringify(
      drafts.map((d) => [d.id, d.transfereeMode, d.newShareholderKind, d.newCompanyLockedFromLookup, d.newCompany.registrationNo]),
    );
  }, [drafts]);

  const repLookupKey = useMemo(() => {
    return JSON.stringify(
      drafts.map((d) => {
        const transferorClientId = shareholderByPartyId.get(d.transferorPartyId)?.companyClientId ?? '';
        return [d.id, d.transfereeMode, d.newShareholderKind, d.newCompany.clientId, transferorClientId];
      }),
    );
  }, [drafts]);

  const personLookupTimersRef = useRef<Record<string, number>>({});
  const companyLookupTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    for (const d of drafts) {
      if (d.transfereeMode !== 'NEW' || d.newShareholderKind !== 'PERSON') continue;
      if (d.newPersonLockedFromLookup) continue;
      const idNo = String(d.newPerson.idNo ?? '').trim();
      if (!idNo) continue;
      const idTypeLabel = ID_TYPE_LABEL_BY_VALUE[d.newPerson.idType] ?? '';

      const prev = personLookupTimersRef.current[d.id];
      if (prev) window.clearTimeout(prev);
      personLookupTimersRef.current[d.id] = window.setTimeout(() => {
        fetch(`/api/portal/people-lookup?idNo=${encodeURIComponent(idNo)}&idTypeLabel=${encodeURIComponent(idTypeLabel)}`, {
          cache: 'no-store',
        })
          .then((r) => r.json().catch(() => null))
          .then((j: any) => {
            const p = j?.person;
            if (!p) return;
            setDrafts((prevDrafts) =>
              prevDrafts.map((x) =>
                x.id !== d.id
                  ? x
                  : {
                      ...x,
                      newPerson: {
                        ...x.newPerson,
                        fullName: String(p.fullName ?? x.newPerson.fullName),
                        email: String(p.email ?? x.newPerson.email),
                        phone: String(p.phone ?? x.newPerson.phone),
                        nationality: String(p.nationality ?? x.newPerson.nationality),
                        dob: String(p.dob ?? x.newPerson.dob),
                        address: String(p.address ?? x.newPerson.address),
                      },
                      newPersonLockedFromLookup: true,
                    },
              ),
            );
          })
          .catch(() => null);
      }, 250);
    }
    return () => {
      for (const k of Object.keys(personLookupTimersRef.current)) {
        window.clearTimeout(personLookupTimersRef.current[k]);
      }
      personLookupTimersRef.current = {};
    };
  }, [personLookupKey]);

  useEffect(() => {
    for (const d of drafts) {
      if (d.transfereeMode !== 'NEW' || d.newShareholderKind !== 'COMPANY') continue;
      const regNo = String(d.newCompany.registrationNo ?? '').trim();
      if (!regNo) continue;

      if (!d.newCompanyLockedFromLookup && !d.newCompany.countryOfIncorporation.trim() && isSingaporeCompanyRegistrationNo(regNo)) {
        patchDraftCompany(d.id, { countryOfIncorporation: 'Singapore' });
      }

      if (d.newCompanyLockedFromLookup) continue;
      const prev = companyLookupTimersRef.current[d.id];
      if (prev) window.clearTimeout(prev);
      companyLookupTimersRef.current[d.id] = window.setTimeout(() => {
        fetch(`/api/portal/company-lookup?registrationNo=${encodeURIComponent(regNo)}`, { cache: 'no-store' })
          .then((r) => r.json().catch(() => null))
          .then((j: any) => {
            const c = j?.company;
            if (!c) {
              patchDraft(d.id, { newCompanyLockedFromLookup: false });
              patchDraftCompany(d.id, { clientId: '' });
              return;
            }
            const addr = String(c.registeredOfficeAddress ?? c.address ?? '').trim();
            const inferredCountry =
              String(c.countryOfIncorporation ?? '').trim() || (isSingaporeCompanyRegistrationNo(regNo) ? 'Singapore' : '');
            setDrafts((prevDrafts) =>
              prevDrafts.map((x) =>
                x.id !== d.id
                  ? x
                  : {
                      ...x,
                      newCompany: {
                        ...x.newCompany,
                        clientId: String(c.clientId ?? ''),
                        representativePersonId: '',
                        companyName: String(c.name ?? x.newCompany.companyName),
                        address: addr || x.newCompany.address,
                        email: String(c.email ?? x.newCompany.email),
                        phone: String(c.phone ?? x.newCompany.phone),
                        countryOfIncorporation: inferredCountry || x.newCompany.countryOfIncorporation,
                      },
                      newCompanyLockedFromLookup: true,
                    },
              ),
            );
          })
          .catch(() => null);
      }, 250);
    }
    return () => {
      for (const k of Object.keys(companyLookupTimersRef.current)) {
        window.clearTimeout(companyLookupTimersRef.current[k]);
      }
      companyLookupTimersRef.current = {};
    };
  }, [companyLookupKey]);

  useEffect(() => {
    for (const d of drafts) {
      if (d.transfereeMode !== 'NEW' || d.newShareholderKind !== 'COMPANY') continue;
      const clientId = d.newCompany.clientId.trim();
      if (!clientId) continue;
      if (directorsByClientId[clientId]) continue;
      fetch(`/api/secretary/companies/${encodeURIComponent(clientId)}/directors-lite`, { cache: 'no-store' })
        .then((r) => r.json().catch(() => null))
        .then((j: any) => {
          const list = Array.isArray(j?.directors) ? (j.directors as any[]) : [];
          const directors = list
            .map((x) => ({
              personId: String(x?.personId ?? '').trim(),
              fullName: String(x?.fullName ?? '').trim(),
              email: String(x?.email ?? '').trim(),
            }))
            .filter((x) => !!x.personId && !!x.fullName);
          setDirectorsByClientId((prev) => ({ ...prev, [clientId]: directors }));
        })
        .catch(() => null);
    }

    for (const d of drafts) {
      const transferorClientId = shareholderByPartyId.get(d.transferorPartyId)?.companyClientId ?? '';
      const clientId = String(transferorClientId).trim();
      if (!clientId) continue;
      if (directorsByClientId[clientId]) continue;
      fetch(`/api/secretary/companies/${encodeURIComponent(clientId)}/directors-lite`, { cache: 'no-store' })
        .then((r) => r.json().catch(() => null))
        .then((j: any) => {
          const list = Array.isArray(j?.directors) ? (j.directors as any[]) : [];
          const directors = list
            .map((x) => ({
              personId: String(x?.personId ?? '').trim(),
              fullName: String(x?.fullName ?? '').trim(),
              email: String(x?.email ?? '').trim(),
            }))
            .filter((x) => !!x.personId && !!x.fullName);
          setDirectorsByClientId((prev) => ({ ...prev, [clientId]: directors }));
        })
        .catch(() => null);
    }
  }, [repLookupKey]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const clientId = selectedClientId;
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
            return {
              partyId,
              label,
              sharesHeld,
              kind: entity?.type === 'COMPANY' ? 'COMPANY' : 'PERSON',
              companyClientId: entity?.type === 'COMPANY' ? String(entity?.company?.id ?? '').trim() || undefined : undefined,
            };
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
  }, [selectedClientId]);

  const visibleTransfers = useMemo(() => {
    return lockedClientId ? transfers.filter((t) => t.clientId === lockedClientId) : transfers;
  }, [lockedClientId, transfers]);

  const filtered = visibleTransfers;

  async function refresh() {
    const res = await fetch('/api/secretary/share-transfers');
    const j = await res.json().catch(() => null);
    if (res.ok && Array.isArray(j?.transfers)) setTransfers(j.transfers);
  }

  function validateDraft(d: ShareTransferDraft, index: number) {
    if (!selectedClientId) return `Transfer #${index + 1}: INVALID_COMPANY`;
    if (!d.transferorPartyId) return `Transfer #${index + 1}: INVALID_TRANSFEROR`;

    const transferor = shareholderByPartyId.get(d.transferorPartyId) ?? null;
    if (transferor?.kind === 'COMPANY' && transferor.companyClientId) {
      if (!d.transferorRepresentativePersonId.trim()) return `Transfer #${index + 1}: INVALID_TRANSFEROR_REPRESENTATIVE`;
    }

    if (!d.effectiveDate) return `Transfer #${index + 1}: INVALID_EFFECTIVE_DATE`;
    if (!d.shares || d.shares <= 0) return `Transfer #${index + 1}: INVALID_SHARES`;
    const valueSgd = Number(d.valueSgd);
    if (!Number.isFinite(valueSgd) || valueSgd < 0) return `Transfer #${index + 1}: INVALID_TRANSFER_PRICE`;

    if (d.transfereeMode === 'EXISTING') {
      if (!d.transfereePartyId) return `Transfer #${index + 1}: INVALID_TRANSFEREE`;
      if (d.transfereePartyId === d.transferorPartyId) return `Transfer #${index + 1}: TRANSFEROR_EQUALS_TRANSFEREE`;
    }

    if (d.transfereeMode === 'NEW') {
      if (d.newShareholderKind === 'PERSON') {
        const p = d.newPerson;
        if (!p.fullName.trim()) return `Transfer #${index + 1}: INVALID_NEW_PERSON_NAME`;
        if (!p.idNo.trim()) return `Transfer #${index + 1}: INVALID_NEW_PERSON_IDNO`;
        if (!p.dob.trim()) return `Transfer #${index + 1}: INVALID_NEW_PERSON_DOB`;
        if (!p.email.trim()) return `Transfer #${index + 1}: INVALID_NEW_PERSON_EMAIL`;
        if (!p.phone.trim()) return `Transfer #${index + 1}: INVALID_NEW_PERSON_PHONE`;
        if (!p.nationality.trim()) return `Transfer #${index + 1}: INVALID_NEW_PERSON_NATIONALITY`;
        if (!p.address.trim()) return `Transfer #${index + 1}: INVALID_NEW_PERSON_ADDRESS`;
      } else {
        const c = d.newCompany;
        if (!c.companyName.trim()) return `Transfer #${index + 1}: INVALID_NEW_COMPANY_NAME`;
        if (!c.registrationNo.trim()) return `Transfer #${index + 1}: INVALID_NEW_COMPANY_REGNO`;
        if (!c.address.trim()) return `Transfer #${index + 1}: INVALID_NEW_COMPANY_ADDRESS`;
        if (c.clientId.trim()) {
          if (!c.representativePersonId.trim()) return `Transfer #${index + 1}: INVALID_CORPORATE_REPRESENTATIVE`;
        } else {
          if (!c.countryOfIncorporation.trim()) return `Transfer #${index + 1}: INVALID_NEW_COMPANY_COUNTRY`;
          if (!c.corporateRepresentativeName.trim()) return `Transfer #${index + 1}: INVALID_NEW_COMPANY_REP_NAME`;
          if (!c.corporateRepresentativeEmail.trim()) return `Transfer #${index + 1}: INVALID_NEW_COMPANY_REP_EMAIL`;
          if (!c.directorSignerEmail.trim()) return `Transfer #${index + 1}: INVALID_NEW_COMPANY_SIGNER_EMAIL`;
        }
      }
    }

    return null;
  }

  async function createAll() {
    setError(null);
    setInfo(null);
    if (!selectedClientId) {
      setError('INVALID_COMPANY');
      return;
    }
    for (let i = 0; i < drafts.length; i++) {
      const msg = validateDraft(drafts[i], i);
      if (msg) {
        setError(msg);
        return;
      }
    }

    setSaving(true);
    try {
      const createdTransfers: ShareTransfer[] = [];
      const infoBlocks: string[] = [];

      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i];
        const valueSgd = Number(d.valueSgd);
        const res = await fetch('/api/secretary/share-transfers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            clientId: selectedClientId,
            effectiveDate: d.effectiveDate,
            shares: d.shares,
            valueSgd,
            shareClass: d.shareClass.trim() || undefined,
            transferor: {
              kind: 'EXISTING_PARTY',
              partyId: d.transferorPartyId,
              representativePersonId: d.transferorRepresentativePersonId,
            },
            transferee:
              d.transfereeMode === 'EXISTING'
                ? { kind: 'EXISTING_PARTY', partyId: d.transfereePartyId }
                : d.newShareholderKind === 'PERSON'
                  ? {
                      kind: 'NEW_PERSON',
                      fullName: d.newPerson.fullName,
                      idType: d.newPerson.idType,
                      idNo: d.newPerson.idNo,
                      dob: d.newPerson.dob,
                      email: d.newPerson.email,
                      phone: d.newPerson.phone,
                      nationality: d.newPerson.nationality,
                      address: d.newPerson.address,
                    }
                  : d.newCompany.clientId.trim()
                    ? {
                        kind: 'COMPANY_CLIENT',
                        clientId: d.newCompany.clientId.trim(),
                        representativePersonId: d.newCompany.representativePersonId.trim(),
                      }
                    : {
                        kind: 'NEW_COMPANY',
                        companyName: d.newCompany.companyName,
                        registrationNo: d.newCompany.registrationNo,
                        countryOfIncorporation: d.newCompany.countryOfIncorporation,
                        address: d.newCompany.address,
                        email: d.newCompany.email,
                        phone: d.newCompany.phone,
                        corporateRepresentativeName: d.newCompany.corporateRepresentativeName,
                        corporateRepresentativeEmail: d.newCompany.corporateRepresentativeEmail,
                        directorSignerName: d.newCompany.directorSignerName,
                        directorSignerEmail: d.newCompany.directorSignerEmail,
                      },
          }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          setError(`Transfer #${i + 1}: ${j?.error ?? `HTTP_${res.status}`}`);
          return;
        }
        const transfer = j?.transfer as ShareTransfer | undefined;
        if (transfer) createdTransfers.push(transfer);

        const docLines: string[] = [];
        const docs = j?.documents as
          | {
              shareTransferFormDocumentId?: string;
              directorsResolutionDocumentId?: string;
              corporateSecretaryCertificateDocumentId?: string;
            }
          | undefined;
        if (docs?.shareTransferFormDocumentId) {
          docLines.push(`Share transfer form PDF — /api/documents/${docs.shareTransferFormDocumentId}/pdf`);
        }
        if (docs?.directorsResolutionDocumentId) {
          docLines.push(`Director's resolution PDF — /api/documents/${docs.directorsResolutionDocumentId}/pdf`);
        }
        if (docs?.corporateSecretaryCertificateDocumentId) {
          docLines.push(
            `Corporate secretary appointment certificate PDF — /api/documents/${docs.corporateSecretaryCertificateDocumentId}/pdf`,
          );
        }

        const signLines: string[] = [];
        const all: Array<{ email: string; url: string }> = [
          ...(j?.signLinks?.br ?? []),
          ...(j?.signLinks?.sta ?? []),
          ...(j?.signLinks?.rdr ?? []),
        ];
        for (const x of all) signLines.push(`${x.email} — ${x.url}`);

        const header = `Transfer #${i + 1}${transfer?.id ? ` (${transfer.id})` : ''}`;
        const parts = [docLines.length ? docLines.join('\n') : null, signLines.length ? signLines.join('\n') : null].filter(Boolean);
        if (parts.length) infoBlocks.push(`${header}\n${parts.join('\n\n')}`);
      }

      if (createdTransfers.length) {
        setTransfers((prev) => [...createdTransfers, ...prev]);
        setInfo(infoBlocks.length ? infoBlocks.join('\n\n') : `CREATED_${createdTransfers.length}`);
        setDrafts([makeDraft()]);
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
            <div />
          </div>

          <div className="mt-4 rounded-lg bg-black/[0.02] border border-black/5 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">New Share Transfer</div>
              <button
                type="button"
                disabled={drafts.length >= 3}
                onClick={() => setDrafts((prev) => (prev.length >= 3 ? prev : [...prev, makeDraft()]))}
                className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/[0.02] disabled:opacity-50"
              >
                Add
              </button>
            </div>

            <div className="mt-3 space-y-4">
              {drafts.map((d, idx) => (
                <div key={d.id} className="rounded-lg bg-white border border-black/5 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Transfer {idx + 1}</div>
                    {drafts.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))}
                        className="text-sm text-black/60 hover:text-black"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-lg bg-white border border-black/5 p-4">
                      <div className="text-sm font-medium">Transferor</div>
                      <div className="mt-2">
                        <select
                          value={d.transferorPartyId}
                          onChange={(e) =>
                            patchDraft(d.id, {
                              transferorPartyId: e.target.value,
                              transferorRepresentativePersonId: '',
                            })
                          }
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
                      </div>

                      {shareholderByPartyId.get(d.transferorPartyId)?.kind === 'COMPANY' &&
                      shareholderByPartyId.get(d.transferorPartyId)?.companyClientId ? (
                        <div className="mt-3">
                          <label className="text-sm block">
                            <div className="text-black/70">Corporate representative</div>
                            <select
                              value={d.transferorRepresentativePersonId}
                              onChange={(e) => patchDraft(d.id, { transferorRepresentativePersonId: e.target.value })}
                              className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                            >
                              <option value="">Select...</option>
                              {(directorsByClientId[
                                shareholderByPartyId.get(d.transferorPartyId)?.companyClientId ?? ''
                              ] ?? []).map((x) => (
                                <option key={x.personId} value={x.personId}>
                                  {x.fullName}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="text-sm">
                          <div className="text-black/70">Effective date</div>
                          <DateInputDMY
                            value={d.effectiveDate}
                            onChange={(next) => patchDraft(d.id, { effectiveDate: next })}
                            inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-black/70">Number of share transferred</div>
                          <input
                            type="number"
                            value={d.shares || ''}
                            onChange={(e) => patchDraft(d.id, { shares: Number(e.target.value) })}
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
                              value={d.valueSgd}
                              onChange={(e) => patchDraft(d.id, { valueSgd: e.target.value })}
                              className="w-full rounded-r-lg border border-black/10 border-l-0 px-3 py-2 text-sm"
                            />
                          </div>
                        </label>
                        <label className="text-sm">
                          <div className="text-black/70">Share class</div>
                          <select
                            value={d.shareClass}
                            onChange={(e) => patchDraft(d.id, { shareClass: e.target.value as ShareTransferDraft['shareClass'] })}
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
                    </div>

                    <div className="rounded-lg bg-white border border-black/5 p-4">
                      <div className="text-sm font-medium">Transferee</div>
                      <div className="mt-2">
                        <select
                          value={d.transfereeMode === 'NEW' ? '__NEW__' : d.transfereePartyId}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '__NEW__') {
                              patchDraft(d.id, { transfereeMode: 'NEW', transfereePartyId: '' });
                            } else {
                              patchDraft(d.id, { transfereeMode: 'EXISTING', transfereePartyId: v });
                            }
                          }}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                          disabled={loadingShareholders}
                        >
                          <option value="">Select...</option>
                          {shareholders
                            .filter((s) => s.partyId !== d.transferorPartyId)
                            .map((s) => (
                              <option key={s.partyId} value={s.partyId}>
                                {s.label}
                              </option>
                            ))}
                          <option value="__NEW__">New Shareholder</option>
                        </select>
                        {loadingShareholders ? <div className="mt-2 text-xs text-black/50">Loading shareholders...</div> : null}
                      </div>

                      {d.transfereeMode === 'NEW' ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex items-center gap-3 text-sm text-black/80">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`newShareholderKind_${d.id}`}
                                checked={d.newShareholderKind === 'PERSON'}
                                onChange={() => patchDraft(d.id, { newShareholderKind: 'PERSON', newPersonLockedFromLookup: false })}
                              />
                              Individual
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`newShareholderKind_${d.id}`}
                                checked={d.newShareholderKind === 'COMPANY'}
                                onChange={() => patchDraft(d.id, { newShareholderKind: 'COMPANY', newCompanyLockedFromLookup: false })}
                              />
                              Corporate
                            </label>
                          </div>

                          {d.newShareholderKind === 'PERSON' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="text-sm">
                                <div className="text-black/70">Full name</div>
                                <input
                                  value={d.newPersonLockedFromLookup ? maskName(d.newPerson.fullName) : d.newPerson.fullName}
                                  onChange={(e) => patchDraftPerson(d.id, { fullName: e.target.value })}
                                  disabled={d.newPersonLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">ID No.</div>
                                <div className="mt-1 grid grid-cols-12 gap-2">
                                  <select
                                    value={d.newPerson.idType}
                                    onChange={(e) => patchDraftPerson(d.id, { idType: e.target.value as NewShareholderPerson['idType'] })}
                                    className="col-span-5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                                  >
                                    <option value="PASSPORT">Passport</option>
                                    <option value="NRIC">NRIC</option>
                                    <option value="FIN">FIN</option>
                                    <option value="IC">IC</option>
                                  </select>
                                  <input
                                    value={d.newPerson.idNo}
                                    onChange={(e) => patchDraftPerson(d.id, { idNo: e.target.value })}
                                    className="col-span-7 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                  />
                                </div>
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Date of birth</div>
                                <input
                                  type="date"
                                  value={d.newPersonLockedFromLookup ? maskDob(d.newPerson.dob) : d.newPerson.dob}
                                  onChange={(e) => patchDraftPerson(d.id, { dob: e.target.value })}
                                  disabled={d.newPersonLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Email</div>
                                <input
                                  value={d.newPersonLockedFromLookup ? maskEmail(d.newPerson.email) : d.newPerson.email}
                                  onChange={(e) => patchDraftPerson(d.id, { email: e.target.value })}
                                  disabled={d.newPersonLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Phone</div>
                                <input
                                  value={d.newPersonLockedFromLookup ? maskPhoneLoose(d.newPerson.phone) : d.newPerson.phone}
                                  onChange={(e) => patchDraftPerson(d.id, { phone: e.target.value })}
                                  disabled={d.newPersonLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Nationality</div>
                                <input
                                  value={d.newPersonLockedFromLookup ? maskNationality(d.newPerson.nationality) : d.newPerson.nationality}
                                  onChange={(e) => patchDraftPerson(d.id, { nationality: e.target.value })}
                                  disabled={d.newPersonLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm sm:col-span-2">
                                <div className="text-black/70">Address</div>
                                <textarea
                                  value={d.newPersonLockedFromLookup ? maskAddress(d.newPerson.address) : d.newPerson.address}
                                  onChange={(e) => patchDraftPerson(d.id, { address: e.target.value })}
                                  rows={2}
                                  disabled={d.newPersonLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="text-sm">
                                <div className="text-black/70">Company name</div>
                                <input
                                  value={d.newCompany.companyName}
                                  onChange={(e) => patchDraftCompany(d.id, { companyName: e.target.value })}
                                  disabled={d.newCompanyLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Company registration no.</div>
                                <input
                                  value={d.newCompany.registrationNo}
                                  onChange={(e) => patchDraftCompany(d.id, { registrationNo: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              {d.newCompany.clientId.trim() ? (
                                <label className="text-sm">
                                  <div className="text-black/70">Corporate representative</div>
                                  <select
                                    value={d.newCompany.representativePersonId}
                                    onChange={(e) => patchDraftCompany(d.id, { representativePersonId: e.target.value })}
                                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {(directorsByClientId[d.newCompany.clientId.trim()] ?? []).map((x) => (
                                      <option key={x.personId} value={x.personId}>
                                        {x.fullName}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                              <label className="text-sm">
                                <div className="text-black/70">Country of incorporation</div>
                                <input
                                  value={d.newCompany.countryOfIncorporation}
                                  onChange={(e) => patchDraftCompany(d.id, { countryOfIncorporation: e.target.value })}
                                  disabled={d.newCompanyLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Email</div>
                                <input
                                  value={d.newCompanyLockedFromLookup ? maskEmail(d.newCompany.email) : d.newCompany.email}
                                  onChange={(e) => patchDraftCompany(d.id, { email: e.target.value })}
                                  disabled={d.newCompanyLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm">
                                <div className="text-black/70">Phone</div>
                                <input
                                  value={d.newCompanyLockedFromLookup ? maskPhoneLoose(d.newCompany.phone) : d.newCompany.phone}
                                  onChange={(e) => patchDraftCompany(d.id, { phone: e.target.value })}
                                  disabled={d.newCompanyLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="text-sm sm:col-span-2">
                                <div className="text-black/70">Address</div>
                                <textarea
                                  value={d.newCompanyLockedFromLookup ? maskAddress(d.newCompany.address) : d.newCompany.address}
                                  onChange={(e) => patchDraftCompany(d.id, { address: e.target.value })}
                                  rows={2}
                                  disabled={d.newCompanyLockedFromLookup}
                                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                />
                              </label>

                              {!d.newCompany.clientId.trim() ? (
                                <>
                                  <label className="text-sm">
                                    <div className="text-black/70">Corporate representative name</div>
                                    <input
                                      value={d.newCompany.corporateRepresentativeName}
                                      onChange={(e) => patchDraftCompany(d.id, { corporateRepresentativeName: e.target.value })}
                                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <div className="text-black/70">Corporate representative email</div>
                                    <input
                                      value={d.newCompany.corporateRepresentativeEmail}
                                      onChange={(e) => patchDraftCompany(d.id, { corporateRepresentativeEmail: e.target.value })}
                                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <div className="text-black/70">Director signer name</div>
                                    <input
                                      value={d.newCompany.directorSignerName}
                                      onChange={(e) => patchDraftCompany(d.id, { directorSignerName: e.target.value })}
                                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <div className="text-black/70">Director signer email</div>
                                    <input
                                      value={d.newCompany.directorSignerEmail}
                                      onChange={(e) => patchDraftCompany(d.id, { directorSignerEmail: e.target.value })}
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
              ))}
            </div>

            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
            {info ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white border border-black/5 p-3 text-xs text-black/70 overflow-x-auto">
                {info}
              </pre>
            ) : null}

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setInfo(null);
                  setDrafts([makeDraft()]);
                }}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/[0.02]"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={() => void createAll()}
                className="ml-2 rounded-full bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
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
