'use client';

import Link from 'next/link';
import { useState } from 'react';

import CompanyInfoForm from '@/app/(app)/secretary/companies/[clientId]/ui/CompanyInfoForm';
import CompanyRolesPanel from '@/app/(app)/secretary/companies/[clientId]/ui/CompanyRolesPanel';
import CorporateSecretaryServicesPanel from '@/app/(app)/secretary/companies/[clientId]/ui/CorporateSecretaryServicesPanel';

type Client = {
  id: string;
  code: string;
  name: string;
  fka?: string;
  companyRegistrationNo?: string;
  fye?: string;
  contactPerson?: string;
  address?: string;
  phone?: string;
  email?: string;
  businessActivities?: string;
  ssicPrimaryCode?: string;
  ssicSecondaryCode?: string;
  paidUpCapitalCurrency?: string;
  paidUpCapitalAmount?: number;
  totalShares?: number;
  incorporationDate?: string;
  registeredOfficeAddress?: string;
  entityStatus?: string;
  isStruckOff?: boolean;
  createdAt: string;
};

type RoleRow = {
  role: { id: string; role: string; shares?: number };
  entity:
    | { type: 'PERSON'; person: { id: string; fullName: string; email?: string; phone?: string; hasLogin: boolean } }
    | { type: 'COMPANY'; company: { id: string; code: string; name: string } };
};

type Props = {
  initialClient: Client;
  initialRoles: {
    directors: RoleRow[];
    shareholders: RoleRow[];
    rorc: RoleRow[];
    secretaries: RoleRow[];
  };
  peopleOptions: Array<{ id: string; fullName: string; email?: string }>;
  companyOptions: Array<{ id: string; code: string; name: string }>;
  canEditCompany: boolean;
  canEditRoles: boolean;
  isClientUser: boolean;
};

export default function SecretaryCompanyClient({
  initialClient,
  initialRoles,
  peopleOptions,
  companyOptions,
  canEditCompany,
  canEditRoles,
  isClientUser,
}: Props) {
  const [client, setClient] = useState<Client>(initialClient);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [autoFillInfo, setAutoFillInfo] = useState<{ status: string; url?: string; foundName?: string } | null>(null);

  const [roles, setRoles] = useState(initialRoles);
  const [creatingLoginForPersonId, setCreatingLoginForPersonId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/secretary/companies/${encodeURIComponent(initialClient.id)}`, { cache: 'no-store' }).catch(
      () => null,
    );
    if (!res?.ok) return;
    const j = (await res.json().catch(() => null)) as
      | {
          client?: Client;
          roles?: Props['initialRoles'];
        }
      | null;
    if (j?.client) setClient(j.client);
    if (j?.roles) setRoles(j.roles);
  }

  async function saveCompany() {
    if (!canEditCompany) return;
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(initialClient.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(client),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      setOk(true);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function autoFill() {
    if (enriching) return;
    setEnriching(true);
    setError(null);
    setOk(false);
    setAutoFillInfo(null);
    try {
      const res = await fetch(`/api/admin/enrich/clients/${encodeURIComponent(initialClient.id)}`, {
        method: 'POST',
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as
        | {
            status?: string;
            url?: string;
            foundName?: string;
          }
        | null;
      const status = String(j?.status ?? '');
      setAutoFillInfo({ status, url: j?.url, foundName: j?.foundName });
      await refresh();
      if (status === 'UPDATED' || status === 'NO_CHANGE') setOk(true);
      else if (status) setError(status);
    } finally {
      setEnriching(false);
    }
  }

  async function addRole(input: {
    role: 'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY';
    personId?: string;
    companyClientId?: string;
    shares?: number;
  }) {
    if (!canEditRoles) return;
    setError(null);
    const res = await fetch(`/api/secretary/companies/${encodeURIComponent(initialClient.id)}/roles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }).catch(() => null);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
      return;
    }
    await refresh();
  }

  async function updateShareholderShares(roleId: string, shares: number) {
    if (!canEditRoles) return;
    setError(null);
    const res = await fetch(`/api/secretary/companies/${encodeURIComponent(initialClient.id)}/roles`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roleId, shares }),
    }).catch(() => null);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
      return;
    }
    await refresh();
  }

  async function removeRole(roleId: string) {
    if (!canEditRoles) return;
    setError(null);
    const res = await fetch(`/api/secretary/companies/${encodeURIComponent(initialClient.id)}/roles`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roleId }),
    }).catch(() => null);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
      return;
    }
    await refresh();
  }

  async function createLogin(personId: string) {
    if (!canEditRoles) return;
    setCreatingLoginForPersonId(personId);
    setTempPassword(null);
    setError(null);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(initialClient.id)}/create-login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as { tempPassword?: string | null } | null;
      setTempPassword(j?.tempPassword ?? null);
      await refresh();
    } finally {
      setCreatingLoginForPersonId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-black/60">
            <Link href="/secretary/companies" className="text-[#2f7bdc] hover:underline">
              Companies
            </Link>
            <span className="mx-2 text-black/30">/</span>
            <span className="text-black/70">{client.name}</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold">Company Detail</h1>
          <div className="mt-1 text-sm text-black/60">{initialClient.code}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={enriching}
            onClick={() => void autoFill()}
            className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {enriching ? 'Auto filling...' : 'Auto Fill'}
          </button>
          <button
            disabled={!canEditCompany || saving}
            onClick={saveCompany}
            className="rounded-md bg-[#46b35a] text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {saving ? 'Saving...' : canEditCompany ? 'Save' : 'Read-only'}
          </button>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      {ok ? <div className="mt-3 text-sm text-[#46b35a]">Saved.</div> : null}
      {autoFillInfo?.url ? (
        <div className="mt-2 text-xs text-black/50">
          Source:{' '}
          <a href={autoFillInfo.url} target="_blank" rel="noreferrer" className="text-[#2f7bdc] hover:underline">
            {autoFillInfo.url}
          </a>
          {autoFillInfo.foundName ? <span className="ml-2">Found: {autoFillInfo.foundName}</span> : null}
        </div>
      ) : null}

      {tempPassword ? (
        <div className="mt-4 rounded-xl bg-[#fff7ed] border border-[#fed7aa] p-4 text-sm">
          <div className="font-medium">临时密码（仅展示一次）</div>
          <div className="mt-1 font-mono text-xs break-all">{tempPassword}</div>
          <div className="mt-2 text-black/60">请让对方登录后在 Profile 中修改密码。</div>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <CorporateSecretaryServicesPanel
            clientId={initialClient.id}
            directors={roles.directors
              .map((d) =>
                d.entity.type === 'PERSON'
                  ? { roleId: d.role.id, fullName: d.entity.person.fullName, email: d.entity.person.email }
                  : null,
              )
              .filter(Boolean) as Array<{ roleId: string; fullName: string; email?: string }>}
            canSubmitDirectorChange={isClientUser}
            canApproveDirectorChange={canEditRoles}
          />
          <CompanyInfoForm client={client} canEdit={canEditCompany} onChange={(patch) => setClient((s) => ({ ...s, ...patch }))} />
        </div>

        <div className="lg:col-span-1 space-y-4">
          <CompanyRolesPanel
            roles={roles}
            peopleOptions={peopleOptions}
            companyOptions={companyOptions}
            totalShares={client.totalShares}
            canEditRoles={canEditRoles}
            creatingLoginForPersonId={creatingLoginForPersonId}
            onAddRole={addRole}
            onRemoveRole={removeRole}
            onCreateLogin={createLogin}
            onUpdateShareholderShares={updateShareholderShares}
          />
        </div>
      </div>
    </div>
  );
}
