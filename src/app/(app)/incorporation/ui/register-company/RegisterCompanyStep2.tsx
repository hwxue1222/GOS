'use client';

import { DateInputYMD } from '@/components/DateInputYMD';

import { RegisterCompanyCard, SectionActionButton } from '@/app/(app)/incorporation/ui/register-company/RegisterCompanyCard';
import CompanyFields from '@/app/(app)/incorporation/ui/register-company/CompanyFields';
import PersonFields from '@/app/(app)/incorporation/ui/register-company/PersonFields';

import type { PersonDraft, RegisterCompanyDraft, RorcControllerDraft, ShareholderDraft } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';
import { emptyPerson, emptyShareholder } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';

type Step2 = RegisterCompanyDraft['step2'];

function parsePositiveInt(v: string) {
  const s = String(v ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatSharePct(part: number | null, total: number | null) {
  if (!part || !total) return null;
  const pct = (part / total) * 100;
  if (!Number.isFinite(pct)) return null;
  if (pct === 0) return '0%';
  if (pct >= 99.995) return '100%';
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
}

export default function RegisterCompanyStep2(props: { value: Step2; totalShares?: string; onChange: (next: Step2) => void }) {
  const v = props.value;
  const set = (patch: Partial<Step2>) => props.onChange({ ...v, ...patch });
  const totalShares = parsePositiveInt(props.totalShares ?? '');

  function updateShareholder(idx: number, next: ShareholderDraft) {
    const list = v.shareholders.slice();
    list[idx] = next;
    set({ shareholders: list });
  }

  function updateDirector(idx: number, next: PersonDraft) {
    const list = v.directors.slice();
    list[idx] = next;
    set({ directors: list });
  }

  function updateController(idx: number, next: RorcControllerDraft) {
    const list = v.rorcControllers.slice();
    list[idx] = next;
    set({ rorcControllers: list });
  }

  function copyShareholdersToDirectors() {
    const people = v.shareholders
      .filter((s) => s.kind === 'PERSON')
      .map((s) => ({ ...s.person, id: emptyPerson().id, lockedFromLookup: s.person.lockedFromLookup }));
    if (!people.length) return;
    set({ directors: people });
  }

  return (
    <div className="space-y-4">
      <RegisterCompanyCard
        title="Shareholders Informations"
        right={<SectionActionButton label="Add Shareholder" onClick={() => set({ shareholders: [...v.shareholders, emptyShareholder()] })} />}
      >
        <div className="space-y-4">
          {v.shareholders.map((sh, idx) => (
            <div key={sh.id} className="rounded-xl border border-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Shareholder {idx + 1}</div>
                <button
                  type="button"
                  disabled={v.shareholders.length <= 1}
                  onClick={() => set({ shareholders: v.shareholders.filter((_, i) => i !== idx) })}
                  className="text-sm text-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`sh-kind-${sh.id}`}
                    checked={sh.kind === 'PERSON'}
                    onChange={() => updateShareholder(idx, { id: sh.id, kind: 'PERSON', shares: sh.shares, person: emptyPerson() })}
                  />
                  Individual shareholder
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`sh-kind-${sh.id}`}
                    checked={sh.kind === 'COMPANY'}
                    onChange={() =>
                      updateShareholder(idx, {
                        id: sh.id,
                        kind: 'COMPANY',
                        shares: sh.shares,
                        company: { companyName: '', registrationNo: '', countryOfIncorporation: '', address: '', email: '', phone: '', lockedFromLookup: false },
                        contacts: { corporateRepresentativeName: '', corporateRepresentativeEmail: '', directorSignerName: '', directorSignerEmail: '' },
                      })
                    }
                  />
                  Corporate shareholder
                </label>
              </div>

              <div className="mt-4">
                <label className="text-sm">
                  <div className="text-black/60">
                    <span className="text-red-600">*</span> Number Of Shares Held
                    {(() => {
                      const pct = formatSharePct(parsePositiveInt(sh.shares), totalShares);
                      return pct ? <span className="ml-2 text-xs text-black/40">({pct} of total)</span> : null;
                    })()}
                  </div>
                  <input
                    value={sh.shares}
                    onChange={(e) => updateShareholder(idx, { ...sh, shares: e.target.value } as ShareholderDraft)}
                    className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
                    inputMode="numeric"
                  />
                </label>
              </div>

              <div className="mt-4">
                {sh.kind === 'PERSON' ? (
                  <PersonFields value={sh.person} onChange={(p) => updateShareholder(idx, { ...sh, person: p })} showUnlock />
                ) : (
                  <div className="space-y-4">
                    <CompanyFields value={sh.company} onChange={(c) => updateShareholder(idx, { ...sh, company: c })} />
                    <div className="rounded-xl border border-black/10 p-4">
                      <div className="text-sm font-semibold">Contacts</div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="text-sm">
                          <div className="text-black/60">
                            <span className="text-red-600">*</span> Corporate Representative Full Name
                          </div>
                          <input
                            value={sh.contacts.corporateRepresentativeName}
                            onChange={(e) => updateShareholder(idx, { ...sh, contacts: { ...sh.contacts, corporateRepresentativeName: e.target.value } })}
                            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-black/60">
                            <span className="text-red-600">*</span> Corporate Representative Email
                          </div>
                          <input
                            value={sh.contacts.corporateRepresentativeEmail}
                            onChange={(e) => updateShareholder(idx, { ...sh, contacts: { ...sh.contacts, corporateRepresentativeEmail: e.target.value } })}
                            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-black/60">
                            <span className="text-red-600">*</span> Director/Secretary Full Name
                          </div>
                          <input
                            value={sh.contacts.directorSignerName}
                            onChange={(e) => updateShareholder(idx, { ...sh, contacts: { ...sh.contacts, directorSignerName: e.target.value } })}
                            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-black/60">
                            <span className="text-red-600">*</span> Director/Secretary Email
                          </div>
                          <input
                            value={sh.contacts.directorSignerEmail}
                            onChange={(e) => updateShareholder(idx, { ...sh, contacts: { ...sh.contacts, directorSignerEmail: e.target.value } })}
                            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </RegisterCompanyCard>

      <RegisterCompanyCard
        title="Director Informations"
        right={
          <button type="button" onClick={copyShareholdersToDirectors} className="text-sm text-black/70 hover:underline">
            Copy Shareholders
          </button>
        }
      >
        <div className="space-y-4">
          {v.directors.map((d, idx) => (
            <div key={d.id} className="rounded-xl border border-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Director {idx + 1}</div>
                <button
                  type="button"
                  disabled={v.directors.length <= 1}
                  onClick={() => set({ directors: v.directors.filter((_, i) => i !== idx) })}
                  className="text-sm text-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
              <div className="mt-4">
                <PersonFields value={d} onChange={(p) => updateDirector(idx, p)} showUnlock />
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionActionButton label="Add Director" onClick={() => set({ directors: [...v.directors, emptyPerson()] })} />
            <label className="flex items-center gap-2 text-sm text-black/70">
              <input
                type="checkbox"
                checked={v.useByBridgeNomineeDirector}
                onChange={(e) => set({ useByBridgeNomineeDirector: e.target.checked })}
                className="h-4 w-4"
              />
              To use BBY nominee director service
            </label>
          </div>
        </div>
      </RegisterCompanyCard>

      <RegisterCompanyCard
        title="RORC Controller Informations"
        right={<SectionActionButton label="Add Controller" onClick={() => set({ rorcControllers: [...v.rorcControllers, { id: emptyPerson().id, person: emptyPerson(), initiationAt: '' }] })} />}
      >
        <div className="space-y-4">
          {v.rorcControllers.map((c, idx) => (
            <div key={c.id} className="rounded-xl border border-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Controller {idx + 1}</div>
                <button
                  type="button"
                  disabled={v.rorcControllers.length <= 1}
                  onClick={() => set({ rorcControllers: v.rorcControllers.filter((_, i) => i !== idx) })}
                  className="text-sm text-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>

              <div className="mt-4">
                <label className="text-sm">
                  <div className="text-black/60">
                    <span className="text-red-600">*</span> Initiation At
                  </div>
                  <DateInputYMD
                    value={c.initiationAt}
                    onChange={(next) => updateController(idx, { ...c, initiationAt: next })}
                    inputClassName="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
                  />
                </label>
                <div className="mt-4">
                  <PersonFields value={c.person} onChange={(p) => updateController(idx, { ...c, person: p })} showUnlock />
                </div>
              </div>
            </div>
          ))}
        </div>
      </RegisterCompanyCard>

      <RegisterCompanyCard title="Secretary Informations">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-black/70">
            <input
              type="checkbox"
              checked={v.useByBridgeCompanySecretary}
              onChange={(e) => set({ useByBridgeCompanySecretary: e.target.checked })}
              className="h-4 w-4"
            />
            To use BBY company secretary
          </label>
          {!v.useByBridgeCompanySecretary ? <PersonFields value={v.secretary} onChange={(p) => set({ secretary: p })} showUnlock /> : null}
        </div>
      </RegisterCompanyCard>
    </div>
  );
}
