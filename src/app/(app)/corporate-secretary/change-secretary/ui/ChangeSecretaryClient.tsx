'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';

type PhoneCountryCode = '+65' | '+86' | '+852' | '+886' | '+60' | '+62' | '+66' | '+84' | '+63' | '+81' | '+82' | '+1' | '+44';

const PHONE_COUNTRY_CODES: Array<{ label: string; value: PhoneCountryCode }> = [
  { label: 'SG +65', value: '+65' },
  { label: 'CN +86', value: '+86' },
  { label: 'HK +852', value: '+852' },
  { label: 'TW +886', value: '+886' },
  { label: 'MY +60', value: '+60' },
  { label: 'ID +62', value: '+62' },
  { label: 'TH +66', value: '+66' },
  { label: 'VN +84', value: '+84' },
  { label: 'PH +63', value: '+63' },
  { label: 'JP +81', value: '+81' },
  { label: 'KR +82', value: '+82' },
  { label: 'US +1', value: '+1' },
  { label: 'UK +44', value: '+44' },
];

const NATIONALITY_OPTIONS = [
  'Singapore',
  'Singapore PR',
  'EP',
  'China',
  'Chinese/hongkong sar',
  'South Korea',
  'Japan',
  'Malaysia',
  'Indonesia',
  'Thailand',
  'Vietnam',
  'Philippines',
  'United States',
  'Canada',
  'Australia',
  'New Zealand',
  'United Kingdom',
  'Germany',
  'France',
  'Italy',
  'Spain',
  'Netherlands',
  'Switzerland',
  'Vanuatu',
] as const;

type NewSecretary = {
  fullName: string;
  dob: string;
  nationality: string;
  phoneCountryCode: PhoneCountryCode;
  phoneLocal: string;
  idNo: string;
  email: string;
  joinDate: string;
  address: string;
};

function normalizePhone(countryCode: string, local: string) {
  const digits = String(local ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return `${countryCode}${digits}`;
}

export default function ChangeSecretaryClient() {
  const router = useRouter();
  const { companyId, client, roles, loading, error, closeHref } = useCompanyContext();

  const [addSecretaries, setAddSecretaries] = useState<NewSecretary[]>([]);
  const [removeSecretaryRoleId, setRemoveSecretaryRoleId] = useState('');
  const [useByBridgeSecretary, setUseByBridgeSecretary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const existing = useMemo(() => roles?.secretaries ?? [], [roles?.secretaries]);

  function patchSecretary(idx: number, patch: Partial<NewSecretary>) {
    setAddSecretaries((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function addRow() {
    setUseByBridgeSecretary(false);
    setRemoveSecretaryRoleId('');
    setAddSecretaries((prev) => [
      ...prev,
      {
        fullName: '',
        dob: '',
        nationality: 'Singapore',
        phoneCountryCode: '+65',
        phoneLocal: '',
        idNo: '',
        email: '',
        joinDate: '',
        address: '',
      },
    ]);
  }

  function deleteRow(idx: number) {
    setAddSecretaries((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }

    const cleanedAdd = addSecretaries
      .map((x) => ({
        fullName: x.fullName.trim(),
        email: x.email.trim(),
        phone: normalizePhone(x.phoneCountryCode, x.phoneLocal),
        dob: x.dob.trim(),
        nationality: x.nationality.trim(),
        idNo: x.idNo.trim(),
        joinDate: x.joinDate.trim(),
        address: x.address.trim(),
      }))
      .filter((x) => !!x.fullName);

    const hasDelete = !!removeSecretaryRoleId.trim();
    const hasAdd = cleanedAdd.length > 0;
    if (!useByBridgeSecretary && !hasDelete && !hasAdd) {
      setSubmitError('Please add or delete at least one secretary.');
      return;
    }

    if (!useByBridgeSecretary && hasAdd) {
      for (const s of cleanedAdd) {
        if (!s.fullName || !s.idNo || !s.email || !s.dob || !s.nationality || !s.phone || !s.joinDate || !s.address) {
          setSubmitError('Please complete all required fields for new secretary.');
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/company-update-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'CHANGE_SECRETARY',
          payload: {
            removeSecretaryRoleId: removeSecretaryRoleId.trim() || undefined,
            addSecretaries: cleanedAdd.map((x) => ({
              fullName: x.fullName,
              email: x.email || undefined,
              phone: x.phone || undefined,
              idNo: x.idNo || undefined,
              nationality: x.nationality || undefined,
              dob: x.dob || undefined,
              address: x.address || undefined,
              joinDate: x.joinDate || undefined,
            })),
            useByBridgeCompanySecretary: useByBridgeSecretary,
          },
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.ok || !j.request?.id) {
        setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      router.push(`/corporate-secretary/applications/company-update/${encodeURIComponent(j.request.id)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Change of Secretary" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-black">New Addition Secretary Informations</div>
              <button
                type="button"
                onClick={addRow}
                disabled={useByBridgeSecretary}
                className="text-sm text-[#2f7bdc] hover:underline disabled:opacity-60"
              >
                Add
              </button>
            </div>

            {addSecretaries.length ? (
              <div className="mt-4 space-y-6">
                {addSecretaries.map((s, i) => (
                  <div key={i}>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Secretary Full Name
                        </div>
                        <input
                          value={s.fullName}
                          onChange={(e) => patchSecretary(i, { fullName: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Passport/NRIC/FIN
                        </div>
                        <input
                          value={s.idNo}
                          onChange={(e) => patchSecretary(i, { idNo: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Date Of Birth
                        </div>
                        <input
                          type="date"
                          value={s.dob}
                          onChange={(e) => patchSecretary(i, { dob: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Email
                        </div>
                        <input
                          value={s.email}
                          onChange={(e) => patchSecretary(i, { email: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Nationality
                        </div>
                        <select
                          value={s.nationality}
                          onChange={(e) => patchSecretary(i, { nationality: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                        >
                          {NATIONALITY_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Join Date
                        </div>
                        <input
                          type="date"
                          value={s.joinDate}
                          onChange={(e) => patchSecretary(i, { joinDate: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Phone
                        </div>
                        <div className="mt-1 flex items-center rounded-lg border border-black/10 overflow-hidden">
                          <select
                            value={s.phoneCountryCode}
                            onChange={(e) => patchSecretary(i, { phoneCountryCode: e.target.value as PhoneCountryCode })}
                            className="bg-white px-3 py-2 text-sm border-r border-black/10"
                          >
                            {PHONE_COUNTRY_CODES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={s.phoneLocal}
                            onChange={(e) => patchSecretary(i, { phoneLocal: e.target.value })}
                            className="flex-1 px-3 py-2 text-sm outline-none"
                            placeholder="Phone"
                          />
                        </div>
                      </label>

                      <label className="sm:col-span-12 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Address
                        </div>
                        <textarea
                          value={s.address}
                          onChange={(e) => patchSecretary(i, { address: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm min-h-[90px]"
                        />
                      </label>
                    </div>

                    <div className="mt-2 flex justify-end">
                      <button type="button" onClick={() => deleteRow(i)} className="text-sm text-red-600 hover:underline">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <div className="text-sm font-medium text-black">Delete Secretary</div>
            <select
              value={removeSecretaryRoleId}
              onChange={(e) => setRemoveSecretaryRoleId(e.target.value)}
              disabled={useByBridgeSecretary || addSecretaries.length > 0}
              className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm disabled:bg-black/5"
            >
              <option value="">Needed Delete Secretary</option>
              {existing.map((r) => (
                <option key={r.role.id} value={r.role.id}>
                  {r.entity.person.fullName}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-black/80">
            <input
              type="checkbox"
              checked={useByBridgeSecretary}
              onChange={(e) => {
                const checked = e.target.checked;
                setUseByBridgeSecretary(checked);
                if (checked) {
                  setAddSecretaries([]);
                  setRemoveSecretaryRoleId('');
                }
              }}
              className="h-4 w-4"
            />
            To use ByBridge company secretary
          </label>

          <button
            disabled={submitting}
            onClick={() => void onSubmit()}
            className="w-full rounded-lg bg-[#2f7bdc] text-white px-4 py-3 text-sm font-medium disabled:opacity-60"
          >
            Apply
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
