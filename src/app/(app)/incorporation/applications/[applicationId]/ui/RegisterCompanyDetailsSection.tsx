'use client';

import { useMemo, useState, type MouseEvent } from 'react';

import RegisterCompanyWizardClient from '@/app/(app)/incorporation/ui/register-company/RegisterCompanyWizardClient';
import type { RegisterCompanyDraft } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';
import { joinCompanyName, normalizeDraftFromPayload } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';
import { AccordionItem } from '@/app/(app)/incorporation/ui/register-company/Accordion';
import { maskAddress, maskDob, maskEmail, maskName, maskNationality, maskPhone } from '@/lib/mask';

type Props = {
  applicationId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'PROCESSING' | 'NEED_MORE_INFO' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  payload: Record<string, unknown>;
  canEdit: boolean;
  onUpdated: () => void;
};

function InfoRow(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-black/50">{props.label}</div>
      <div className="mt-1 font-medium whitespace-pre-wrap">{props.value || '-'}</div>
    </div>
  );
}

function ActionButton(props: { label: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; icon?: 'back' | 'edit' }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex items-center gap-1.5 rounded-md bg-white border border-black/10 px-2.5 py-1 text-xs font-medium text-black/70 hover:bg-black/[0.02]"
    >
      {props.icon === 'back' ? (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="fill-current text-black/60">
          <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.41 11H20a1 1 0 1 1 0 2h-9.59l4.3 4.3a1 1 0 1 1-1.42 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.41 0Z" />
        </svg>
      ) : props.icon === 'edit' ? (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="fill-current text-black/60">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
        </svg>
      ) : null}
      <span>{props.label}</span>
    </button>
  );
}

function maskIdNo(raw: string) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.length <= 3) return '*'.repeat(Math.max(3, s.length));
  return `${s[0]}${'*'.repeat(Math.max(2, s.length - 3))}${s.slice(-2)}`;
}

function PeopleList(props: {
  title: string;
  items: Array<{ fullName: string; idNo: string; email: string; dob?: string; nationality?: string; phoneCountryCode?: string; phoneLocal?: string; address?: string }>;
}) {
  return (
    <div className="rounded-xl border border-black/10 p-4">
      <div className="text-sm font-semibold">{props.title}</div>
      {props.items.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60 bg-black/[0.02]">
              <tr className="border-b border-black/10">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">ID No.</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">DOB</th>
                <th className="px-3 py-2 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {props.items.map((p, idx) => (
                <tr key={`${p.idNo}-${idx}`} className="border-b border-black/5">
                  <td className="px-3 py-2">{p.fullName ? maskName(p.fullName) : '-'}</td>
                  <td className="px-3 py-2">{p.idNo ? maskIdNo(p.idNo) : '-'}</td>
                  <td className="px-3 py-2">{p.email ? maskEmail(p.email) : '-'}</td>
                  <td className="px-3 py-2">{p.dob ? maskDob(p.dob) : '-'}</td>
                  <td className="px-3 py-2">{p.phoneLocal ? maskPhone(p.phoneCountryCode ?? '+65', p.phoneLocal) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {props.items.some((x) => (x.address ?? '').trim()) ? (
            <div className="mt-3 rounded-lg border border-black/10 p-3">
              <div className="text-xs font-medium text-black/60">Addresses</div>
              <div className="mt-2 space-y-2">
                {props.items.map((p, idx) => (
                  <div key={`${p.idNo}-addr-${idx}`} className="text-sm">
                    <div className="text-black/70">{p.fullName ? maskName(p.fullName) : `Person ${idx + 1}`}</div>
                    <div className="mt-1 text-black/50 whitespace-pre-wrap">{p.address ? maskAddress(p.address) : '-'}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 text-sm text-black/40">No data</div>
      )}
    </div>
  );
}

export default function RegisterCompanyDetailsSection(props: Props) {
  const [editing, setEditing] = useState<
    | null
    | {
        step: 1 | 2 | 3;
        focus?: 'shareholders' | 'directors' | 'rorc' | 'secretary' | 'confirm';
      }
  >(null);
  const [open, setOpen] = useState<Record<string, boolean>>({
    step1: true,
    step2: true,
    shareholders: true,
    directors: false,
    rorc: false,
    secretary: false,
    confirm: true,
  });

  const normalized = useMemo<RegisterCompanyDraft>(() => normalizeDraftFromPayload(props.payload, undefined), [props.payload]);
  const companyNameFull = useMemo(
    () => joinCompanyName(normalized.step1.companyName, normalized.step1.companySuffix),
    [normalized.step1.companyName, normalized.step1.companySuffix],
  );

  if (editing && props.canEdit) {
    return (
      <div className="rounded-xl bg-white border border-black/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">Edit</div>
          <ActionButton label="Back" icon="back" onClick={() => setEditing(null)} />
        </div>
        <div className="mt-4">
          <RegisterCompanyWizardClient
            mode="edit"
            applicationId={props.applicationId}
            initialPayload={props.payload}
            canEdit={props.canEdit}
            initialStep={editing.step}
            initialFocus={editing.focus}
            onSaved={() => {
              props.onUpdated();
              setEditing(null);
            }}
            onSubmitted={() => {
              props.onUpdated();
              setEditing(null);
            }}
          />
        </div>
      </div>
    );
  }

  const shareholders = normalized.step2.shareholders;
  const directors = normalized.step2.directors;
  const rorc = normalized.step2.rorcControllers;
  const secretary = normalized.step2.useByBridgeCompanySecretary ? null : normalized.step2.secretary;


  return (
    <div className="rounded-xl bg-white border border-black/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Details</div>
        <div />
      </div>

      <div className="mt-4 space-y-3">
        <AccordionItem
          title="Step 1 - Basic information"
          open={!!open.step1}
          onToggle={() => setOpen((p) => ({ ...p, step1: !p.step1 }))}
          right={
            props.canEdit && props.status === 'SUBMITTED' ? (
              <ActionButton
                label="Edit"
                icon="edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing({ step: 1 });
                }}
              />
            ) : null
          }
        >
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <InfoRow label="Company" value={companyNameFull} />
            <InfoRow label="Alternative Name" value={joinCompanyName(normalized.step1.alternativeName, normalized.step1.alternativeSuffix)} />
            <InfoRow label="Registered Share Capital" value={`${normalized.step1.paidUpCapitalCurrency} ${normalized.step1.paidUpCapitalAmount}`} />
            <InfoRow label="Total Number Of Shares" value={normalized.step1.totalShares} />
            <InfoRow label="Activity 1" value={normalized.step1.ssicPrimaryCode} />
            <InfoRow label="Activity 2" value={normalized.step1.ssicSecondaryCode} />
            <InfoRow label="Company Address" value={normalized.step1.address} />
            <InfoRow label="Use BBY registered office" value={normalized.step1.useByBridgeRegisteredOfficeAddress ? 'Yes' : 'No'} />
          </div>
        </AccordionItem>

        <AccordionItem
          title={`Shareholders (${shareholders.length})`}
          open={!!open.shareholders}
          onToggle={() => setOpen((p) => ({ ...p, shareholders: !p.shareholders }))}
          right={
            props.canEdit && props.status === 'SUBMITTED' ? (
              <ActionButton
                label="Edit"
                icon="edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing({ step: 2, focus: 'shareholders' });
                }}
              />
            ) : null
          }
        >
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-black/60 bg-black/[0.02]">
                <tr className="border-b border-black/10">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Shares</th>
                  <th className="px-3 py-2 font-medium">ID / Reg</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {shareholders.map((s, idx) => (
                  <tr key={idx} className="border-b border-black/5">
                    <td className="px-3 py-2">{s.kind === 'PERSON' ? 'Individual' : 'Company'}</td>
                    <td className="px-3 py-2">
                      {s.kind === 'PERSON' ? (s.person.fullName ? maskName(s.person.fullName) : '-') : s.company.companyName || '-'}
                    </td>
                    <td className="px-3 py-2">{s.shares || '-'}</td>
                    <td className="px-3 py-2">
                      {s.kind === 'PERSON' ? (s.person.idNo ? maskIdNo(s.person.idNo) : '-') : s.company.registrationNo ? maskIdNo(s.company.registrationNo) : '-'}
                    </td>
                    <td className="px-3 py-2">{s.kind === 'PERSON' ? maskEmail(s.person.email) : maskEmail(s.company.email)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AccordionItem>

        <AccordionItem
          title={`Directors (${directors.length})`}
          open={!!open.directors}
          onToggle={() => setOpen((p) => ({ ...p, directors: !p.directors }))}
          right={
            props.canEdit && props.status === 'SUBMITTED' ? (
              <ActionButton
                label="Edit"
                icon="edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing({ step: 2, focus: 'directors' });
                }}
              />
            ) : null
          }
        >
          <PeopleList
            title="Directors"
            items={directors.map((p) => ({
              fullName: p.fullName,
              idNo: p.idNo,
              email: p.email,
              dob: p.dob,
              nationality: p.nationality ? maskNationality(p.nationality) : undefined,
              phoneCountryCode: p.phoneCountryCode,
              phoneLocal: p.phoneLocal,
              address: p.address,
            }))}
          />
        </AccordionItem>

        <AccordionItem
          title={`RORC Controllers (${rorc.length})`}
          open={!!open.rorc}
          onToggle={() => setOpen((p) => ({ ...p, rorc: !p.rorc }))}
          right={
            props.canEdit && props.status === 'SUBMITTED' ? (
              <ActionButton
                label="Edit"
                icon="edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing({ step: 2, focus: 'rorc' });
                }}
              />
            ) : null
          }
        >
          <PeopleList
            title="RORC Controllers"
            items={rorc.map((c) => ({
              fullName: c.person.fullName,
              idNo: c.person.idNo,
              email: c.person.email,
              dob: c.person.dob,
              nationality: c.person.nationality ? maskNationality(c.person.nationality) : undefined,
              phoneCountryCode: c.person.phoneCountryCode,
              phoneLocal: c.person.phoneLocal,
              address: c.person.address,
            }))}
          />
        </AccordionItem>

        <AccordionItem
          title="Secretary"
          open={!!open.secretary}
          onToggle={() => setOpen((p) => ({ ...p, secretary: !p.secretary }))}
          right={
            props.canEdit && props.status === 'SUBMITTED' ? (
              <ActionButton
                label="Edit"
                icon="edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing({ step: 2, focus: 'secretary' });
                }}
              />
            ) : null
          }
        >
          {normalized.step2.useByBridgeCompanySecretary ? (
            <div className="mt-3 text-sm text-black/70">BBY company secretary</div>
          ) : secretary ? (
            <PeopleList
              title="Secretary"
              items={[
                {
                  fullName: secretary.fullName,
                  idNo: secretary.idNo,
                  email: secretary.email,
                  dob: secretary.dob,
                  nationality: secretary.nationality ? maskNationality(secretary.nationality) : undefined,
                  phoneCountryCode: secretary.phoneCountryCode,
                  phoneLocal: secretary.phoneLocal,
                  address: secretary.address,
                },
              ]}
            />
          ) : (
            <div className="mt-3 text-sm text-black/40">No data</div>
          )}
        </AccordionItem>

        <AccordionItem
          title="Step 2 - Personal information"
          open={!!open.step2}
          onToggle={() => setOpen((p) => ({ ...p, step2: !p.step2 }))}
          right={
            props.canEdit && props.status === 'SUBMITTED' ? (
              <ActionButton
                label="Edit"
                icon="edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing({ step: 2 });
                }}
              />
            ) : null
          }
        >
          <div className="mt-2 text-sm text-black/60">Includes: Shareholders, Directors, RORC Controllers, Secretary.</div>
        </AccordionItem>

        <AccordionItem
          title="Step 3 - Information confirmed"
          open={!!open.confirm}
          onToggle={() => setOpen((p) => ({ ...p, confirm: !p.confirm }))}
          right={
            props.canEdit && props.status === 'SUBMITTED' ? (
              <ActionButton
                label="Edit"
                icon="edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing({ step: 3, focus: 'confirm' });
                }}
              />
            ) : null
          }
        >
          <div className="mt-2 text-sm text-black/70">
            Confirmations saved: {normalized.step3.confirmInfoAccurate && normalized.step3.confirmAuthorizedToSubmit ? 'Yes' : 'No'}
          </div>
        </AccordionItem>
      </div>
    </div>
  );
}
