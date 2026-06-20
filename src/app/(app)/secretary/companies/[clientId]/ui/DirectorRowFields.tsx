'use client';

import { maskAddress, maskDob, maskEmail, maskName, maskNationality, maskPhone } from '@/lib/mask';
import { NATIONALITY_OPTIONS, PHONE_COUNTRY_CODES, type NewDirector, type PhoneCountryCode } from './directorChangeFormUtils';
import { DateInputYMD } from '@/components/DateInputYMD';

export default function DirectorRowFields(props: {
  idx: number;
  value: NewDirector;
  showErrors: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onPatch: (patch: Partial<NewDirector>) => void;
  onIdNoInput: (nextIdNo: string, wasLocked: boolean) => void;
  validate: (s: NewDirector) => { missing: Record<string, boolean>; invalid: Record<string, boolean> };
}) {
  const s = props.value;
  const v = props.validate(s);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-black">Director {props.idx + 1}</div>
        {props.canDelete ? (
          <button
            type="button"
            onClick={props.onDelete}
            className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.02]"
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        <label className="sm:col-span-6 text-sm">
          <div className="text-black">
            <span className="text-red-500">*</span> Full Name
          </div>
          <input
            value={s.lockedFromMember ? maskName(s.fullName) : s.fullName}
            onChange={(e) => props.onPatch({ fullName: e.target.value })}
            disabled={s.lockedFromMember}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${s.lockedFromMember ? 'bg-black/5 text-black/60' : ''} ${props.showErrors && v.missing.fullName ? 'border-red-500' : 'border-black/10'}`}
          />
        </label>

        <label className="sm:col-span-6 text-sm">
          <div className="text-black">
            <span className="text-red-500">*</span> Identification
          </div>
          <div className="mt-1 flex items-center gap-2">
            <select
              value={s.idTypeLabel}
              onChange={(e) => props.onPatch({ idTypeLabel: e.target.value as NewDirector['idTypeLabel'] })}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="Passport No.">Passport No.</option>
              <option value="NRIC No.">NRIC No.</option>
              <option value="FIN No.">FIN No.</option>
              <option value="IC No.">IC No.</option>
              <option value="ID No.">ID No.</option>
            </select>
            <input
              value={s.idNo}
              onChange={(e) => props.onIdNoInput(e.target.value, s.lockedFromMember)}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${props.showErrors && v.missing.idNo ? 'border-red-500' : 'border-black/10'}`}
              placeholder={s.idTypeLabel}
            />
          </div>
        </label>

        <label className="sm:col-span-6 text-sm">
          <div className="text-black">
            <span className="text-red-500">*</span> Date Of Birth
          </div>
          {s.dobLocked ? (
            <input
              type="text"
              value={maskDob(s.dob)}
              disabled
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-black/5 text-black/60 ${props.showErrors && v.missing.dob ? 'border-red-500' : 'border-black/10'}`}
            />
          ) : (
            <DateInputYMD
              value={s.dob}
              onChange={(dob) => props.onPatch({ dob, dobLocked: false })}
              inputClassName={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${props.showErrors && v.missing.dob ? 'border-red-500' : 'border-black/10'}`}
            />
          )}
        </label>

        <label className="sm:col-span-6 text-sm">
          <div className="text-black">
            <span className="text-red-500">*</span> Email
          </div>
          <input
            value={s.lockedFromMember ? maskEmail(s.email) : s.email}
            onChange={(e) => props.onPatch({ email: e.target.value })}
            disabled={s.lockedFromMember}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${s.lockedFromMember ? 'bg-black/5 text-black/60' : ''} ${props.showErrors && (v.missing.email || v.invalid.email) ? 'border-red-500' : 'border-black/10'}`}
          />
          {props.showErrors && v.invalid.email ? <div className="mt-1 text-xs text-red-600">Invalid email format</div> : null}
        </label>

        <label className="sm:col-span-6 text-sm">
          <div className="text-black">
            <span className="text-red-500">*</span> Nationality
          </div>
          {s.lockedFromMember ? (
            <input
              value={maskNationality(s.nationality)}
              disabled
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-black/5 text-black/60 ${props.showErrors && v.missing.nationality ? 'border-red-500' : 'border-black/10'}`}
            />
          ) : (
            <select
              value={s.nationality}
              onChange={(e) => props.onPatch({ nationality: e.target.value })}
              className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm ${props.showErrors && v.missing.nationality ? 'border-red-500' : 'border-black/10'}`}
            >
              {NATIONALITY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="sm:col-span-6 text-sm">
          <div className="text-black">
            <span className="text-red-500">*</span> Phone
          </div>
          <div className={`mt-1 flex items-center rounded-lg border overflow-hidden ${props.showErrors && v.missing.phone ? 'border-red-500' : 'border-black/10'}`}>
            <select
              value={s.phoneCountryCode}
              onChange={(e) => props.onPatch({ phoneCountryCode: e.target.value as PhoneCountryCode })}
              disabled={s.lockedFromMember}
              className={`px-3 py-2 text-sm border-r border-black/10 ${s.lockedFromMember ? 'bg-black/5 text-black/60' : 'bg-white'}`}
            >
              {PHONE_COUNTRY_CODES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              value={s.lockedFromMember ? maskPhone(s.phoneCountryCode, s.phoneLocal) : s.phoneLocal}
              onChange={(e) => props.onPatch({ phoneLocal: e.target.value })}
              disabled={s.lockedFromMember}
              className={`flex-1 px-3 py-2 text-sm outline-none ${s.lockedFromMember ? 'bg-black/5 text-black/60' : ''}`}
              placeholder="Phone"
            />
          </div>
        </label>

        <label className="sm:col-span-12 text-sm">
          <div className="text-black">
            <span className="text-red-500">*</span> Address
          </div>
          {s.lockedFromMember ? (
            <textarea
              value={maskAddress(s.address)}
              disabled
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[90px] bg-black/5 text-black/60 ${props.showErrors && v.missing.address ? 'border-red-500' : 'border-black/10'}`}
            />
          ) : (
            <textarea
              value={s.address}
              onChange={(e) => props.onPatch({ address: e.target.value })}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[90px] ${props.showErrors && v.missing.address ? 'border-red-500' : 'border-black/10'}`}
            />
          )}
        </label>
      </div>
    </div>
  );
}
