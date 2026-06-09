'use client';

import { useEffect, useMemo, useState } from 'react';
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
  declaration: {
    i: boolean;
    ii: boolean;
    iii: boolean;
    iv: boolean;
    v: boolean;
    vi: boolean;
    vii: boolean;
  };
};

function normalizePhone(countryCode: string, local: string) {
  const digits = String(local ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return `${countryCode}${digits}`;
}

function draftKey(companyId: string) {
  return `gos.draft.changeSecretary.${companyId}`;
}

export default function ChangeSecretaryClient() {
  const router = useRouter();
  const { companyId, client, roles, loading, error, closeHref } = useCompanyContext();

  const [addSecretaries, setAddSecretaries] = useState<NewSecretary[]>([]);
  const [removeSecretaryRoleId, setRemoveSecretaryRoleId] = useState('');
  const [useByBridgeSecretary, setUseByBridgeSecretary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const raw = window.localStorage.getItem(draftKey(companyId));
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as {
        removeSecretaryRoleId?: string;
        useByBridgeSecretary?: boolean;
        addSecretaries?: NewSecretary[];
      };
      if (typeof d.removeSecretaryRoleId === 'string') setRemoveSecretaryRoleId(d.removeSecretaryRoleId);
      if (typeof d.useByBridgeSecretary === 'boolean') setUseByBridgeSecretary(d.useByBridgeSecretary);
      if (Array.isArray(d.addSecretaries)) setAddSecretaries(d.addSecretaries);
    } catch {
      window.localStorage.removeItem(draftKey(companyId));
    }
  }, [companyId]);

  const existing = useMemo(() => roles?.secretaries ?? [], [roles?.secretaries]);

  function patchSecretary(idx: number, patch: Partial<NewSecretary>) {
    setAddSecretaries((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function addRow() {
    setUseByBridgeSecretary(false);
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
        declaration: { i: false, ii: false, iii: false, iv: false, v: false, vi: false, vii: false },
      },
    ]);
  }

  function deleteRow(idx: number) {
    setAddSecretaries((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSave() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }

    setSubmitting(true);
    try {
      window.localStorage.setItem(
        draftKey(companyId),
        JSON.stringify({
          removeSecretaryRoleId,
          useByBridgeSecretary,
          addSecretaries,
          savedAt: new Date().toISOString(),
        }),
      );
      router.push(closeHref);
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
              <div className="text-sm text-black">New secretary appointed</div>
              <button
                type="button"
                onClick={addRow}
                disabled={useByBridgeSecretary}
                className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium hover:bg-black/2 disabled:opacity-60"
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

                      <div className="sm:col-span-12 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Declaration
                        </div>
                        <div className="mt-2 text-black/70">
                          I am a qualified person under section 171(1AA) of the Companies Act by virtue of my being —
                        </div>
                        <div className="mt-2 space-y-2">
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.i}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, i: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(i) a secretary of a company for at least 3 of the 5 years immediately preceding the abovementioned date of my appointment as secretary of the abovenamed company.</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.ii}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, ii: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(ii) a qualified person under the Legal Profession Act (Cap. 161).</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.iii}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, iii: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(iii) public accountant registered or deemed to be registered under the Accountants Act (Cap. 2).</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.iv}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, iv: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(iv) a member of the Singapore Association of the Institute of Chartered Secretaries and Administrators.</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.v}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, v: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(v) a member of the Institute of Singapore Chartered Accountants (formerly known as the Institute of Certified Public Accountants of Singapore).</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.vi}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, vi: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(vi) a member of the Association of International Accountants (Singapore Branch).</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.vii}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, vii: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(vii) a member of The Institute of Company Accountants, Singapore.</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => deleteRow(i)}
                        className="rounded-md bg-white border border-red-200 text-red-700 px-3 py-1.5 text-xs font-medium hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="border-t border-black/10" />

          <div>
            <div className="text-sm font-medium text-black">Resignation of secretary</div>
            <select
              value={removeSecretaryRoleId}
              onChange={(e) => setRemoveSecretaryRoleId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value=""></option>
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
                }
              }}
              className="h-4 w-4"
            />
            To use ByBridge company secretary
          </label>

          <button
            disabled={submitting}
            onClick={() => void onSave()}
            className="w-full rounded-lg bg-[#2f7bdc] text-white px-4 py-3 text-sm font-medium disabled:opacity-60"
          >
            Save
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
