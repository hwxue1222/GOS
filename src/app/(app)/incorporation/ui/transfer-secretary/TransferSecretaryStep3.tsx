'use client';

import { useMemo, useState } from 'react';

import { AccordionItem } from '@/app/(app)/incorporation/ui/register-company/Accordion';
import { maskAddress, maskDob, maskEmail, maskName, maskNationality, maskPhone } from '@/lib/mask';

import type { TransferSecretaryDraft } from '@/app/(app)/incorporation/ui/transfer-secretary/transferSecretaryDraft';

export default function TransferSecretaryStep3(props: {
  draft: TransferSecretaryDraft;
  companyNameFull: string;
  value: TransferSecretaryDraft['step3'];
  onChange: (next: TransferSecretaryDraft['step3']) => void;
}) {
  const v = props.value;
  const set = (patch: Partial<typeof v>) => props.onChange({ ...v, ...patch });
  const d = props.draft;

  const [open, setOpen] = useState<Record<string, boolean>>({ step1: true, shareholders: true, directors: false, rorc: false, secretary: false, confirm: true });
  const [showSensitive, setShowSensitive] = useState(false);

  const formatPhone = (countryCode: string, local: string) => {
    const cc = String(countryCode ?? '').trim() || '+65';
    const digits = String(local ?? '').trim();
    return digits ? `${cc} ${digits}` : cc;
  };

  const maskIdNo = (raw: string) => {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    if (s.length <= 3) return '*'.repeat(Math.max(3, s.length));
    return `${s[0]}${'*'.repeat(Math.max(2, s.length - 3))}${s.slice(-2)}`;
  };

  const shareholders = useMemo(() => {
    return d.step2.shareholders.map((s) => {
      if (s.kind === 'PERSON') {
        return {
          kind: 'PERSON' as const,
          shares: s.shares,
          fullName: s.person.fullName,
          idNo: s.person.idNo,
          email: s.person.email,
          dob: s.person.dob,
          nationality: s.person.nationality,
          phoneCountryCode: s.person.phoneCountryCode,
          phoneLocal: s.person.phoneLocal,
          address: s.person.address,
        };
      }
      return {
        kind: 'COMPANY' as const,
        shares: s.shares,
        companyName: s.company.companyName,
        registrationNo: s.company.registrationNo,
        email: s.company.email,
        address: s.company.address,
      };
    });
  }, [d.step2.shareholders]);

  const directors = useMemo(() => {
    return d.step2.directors.map((p) => ({
      fullName: p.fullName,
      idNo: p.idNo,
      email: p.email,
      dob: p.dob,
      nationality: p.nationality,
      phoneCountryCode: p.phoneCountryCode,
      phoneLocal: p.phoneLocal,
      address: p.address,
    }));
  }, [d.step2.directors]);

  const controllers = useMemo(() => {
    return d.step2.rorcControllers.map((c) => ({
      initiationAt: c.initiationAt,
      fullName: c.person.fullName,
      idNo: c.person.idNo,
      email: c.person.email,
      dob: c.person.dob,
      nationality: c.person.nationality,
      phoneCountryCode: c.person.phoneCountryCode,
      phoneLocal: c.person.phoneLocal,
      address: c.person.address,
    }));
  }, [d.step2.rorcControllers]);

  const secretary = useMemo(() => {
    if (d.step2.useByBridgeCompanySecretary) return { useByBridge: true as const, person: null };
    const p = d.step2.secretary;
    return {
      useByBridge: false as const,
      person: {
        fullName: p.fullName,
        idNo: p.idNo,
        email: p.email,
        dob: p.dob,
        nationality: p.nationality,
        phoneCountryCode: p.phoneCountryCode,
        phoneLocal: p.phoneLocal,
        address: p.address,
      },
    };
  }, [d.step2.secretary, d.step2.useByBridgeCompanySecretary]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-black/60">Review (read-only)</div>
        <label className="flex items-center gap-2 text-sm text-black/70">
          <input type="checkbox" checked={showSensitive} onChange={(e) => setShowSensitive(e.target.checked)} className="h-4 w-4" />
          Show full details
        </label>
      </div>

      <AccordionItem title="Step 1 - Basic information" open={!!open.step1} onToggle={() => setOpen((p) => ({ ...p, step1: !p.step1 }))}>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-black/50">Company</div>
            <div className="mt-1 font-medium">{props.companyNameFull || '-'}</div>
          </div>
          <div>
            <div className="text-black/50">Register Number</div>
            <div className="mt-1 font-medium">{d.step1.companyRegistrationNo || '-'}</div>
          </div>
          <div>
            <div className="text-black/50">Registered Share Capital</div>
            <div className="mt-1 font-medium">
              {d.step1.paidUpCapitalCurrency} {d.step1.paidUpCapitalAmount || '-'}
            </div>
          </div>
          <div>
            <div className="text-black/50">Total Number Of Shares</div>
            <div className="mt-1 font-medium">{d.step1.totalShares || '-'}</div>
          </div>
          <div>
            <div className="text-black/50">Activity 1</div>
            <div className="mt-1 font-medium">{d.step1.ssicPrimaryCode || '-'}</div>
          </div>
          <div>
            <div className="text-black/50">Activity 2</div>
            <div className="mt-1 font-medium">{d.step1.ssicSecondaryCode || '-'}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-black/50">Company Address</div>
            <div className="mt-1 font-medium whitespace-pre-wrap">{showSensitive ? d.step1.address || '-' : maskAddress(d.step1.address || '') || '-'}</div>
          </div>
        </div>
      </AccordionItem>

      <AccordionItem title={`Step 2 - Shareholders (${shareholders.length})`} open={!!open.shareholders} onToggle={() => setOpen((p) => ({ ...p, shareholders: !p.shareholders }))}>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60">
              <tr className="border-b border-black/5">
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
                    {s.kind === 'PERSON' ? (showSensitive ? s.fullName : maskName(s.fullName)) : s.companyName}
                  </td>
                  <td className="px-3 py-2">{s.shares}</td>
                  <td className="px-3 py-2">{s.kind === 'PERSON' ? maskIdNo(s.idNo) : s.registrationNo}</td>
                  <td className="px-3 py-2">{showSensitive ? s.email : maskEmail(s.email)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccordionItem>

      <AccordionItem title={`Step 2 - Directors (${directors.length})`} open={!!open.directors} onToggle={() => setOpen((p) => ({ ...p, directors: !p.directors }))}>
        <div className="mt-2 space-y-2">
          {directors.map((p, idx) => (
            <div key={idx} className="rounded-lg border border-black/10 p-3 text-sm">
              <div className="font-medium">{showSensitive ? p.fullName : maskName(p.fullName)}</div>
              <div className="mt-1 text-black/60">ID: {maskIdNo(p.idNo)}</div>
              <div className="text-black/60">Email: {showSensitive ? p.email : maskEmail(p.email)}</div>
              <div className="text-black/60">DOB: {showSensitive ? p.dob : maskDob(p.dob)}</div>
              <div className="text-black/60">Nationality: {showSensitive ? p.nationality : maskNationality(p.nationality)}</div>
              <div className="text-black/60">Phone: {showSensitive ? formatPhone(p.phoneCountryCode, p.phoneLocal) : maskPhone(p.phoneCountryCode, p.phoneLocal)}</div>
              <div className="text-black/60">Address: {showSensitive ? p.address : maskAddress(p.address)}</div>
            </div>
          ))}
        </div>
      </AccordionItem>

      <AccordionItem title={`Step 2 - RORC Controllers (${controllers.length})`} open={!!open.rorc} onToggle={() => setOpen((p) => ({ ...p, rorc: !p.rorc }))}>
        <div className="mt-2 space-y-2">
          {controllers.map((p, idx) => (
            <div key={idx} className="rounded-lg border border-black/10 p-3 text-sm">
              <div className="font-medium">{showSensitive ? p.fullName : maskName(p.fullName)}</div>
              <div className="mt-1 text-black/60">Initiation At: {p.initiationAt || '-'}</div>
              <div className="text-black/60">ID: {maskIdNo(p.idNo)}</div>
              <div className="text-black/60">Email: {showSensitive ? p.email : maskEmail(p.email)}</div>
              <div className="text-black/60">DOB: {showSensitive ? p.dob : maskDob(p.dob)}</div>
              <div className="text-black/60">Nationality: {showSensitive ? p.nationality : maskNationality(p.nationality)}</div>
              <div className="text-black/60">Phone: {showSensitive ? formatPhone(p.phoneCountryCode, p.phoneLocal) : maskPhone(p.phoneCountryCode, p.phoneLocal)}</div>
              <div className="text-black/60">Address: {showSensitive ? p.address : maskAddress(p.address)}</div>
            </div>
          ))}
        </div>
      </AccordionItem>

      <AccordionItem title="Step 2 - Secretary" open={!!open.secretary} onToggle={() => setOpen((p) => ({ ...p, secretary: !p.secretary }))}>
        <div className="mt-2 text-sm">
          {secretary.useByBridge ? (
            <div className="text-black/60">Secretary: BBY company secretary</div>
          ) : secretary.person ? (
            <div className="space-y-1">
              <div className="font-medium">{showSensitive ? secretary.person.fullName : maskName(secretary.person.fullName)}</div>
              <div className="text-black/60">ID: {maskIdNo(secretary.person.idNo)}</div>
              <div className="text-black/60">Email: {showSensitive ? secretary.person.email : maskEmail(secretary.person.email)}</div>
              <div className="text-black/60">DOB: {showSensitive ? secretary.person.dob : maskDob(secretary.person.dob)}</div>
              <div className="text-black/60">Nationality: {showSensitive ? secretary.person.nationality : maskNationality(secretary.person.nationality)}</div>
              <div className="text-black/60">Phone: {showSensitive ? formatPhone(secretary.person.phoneCountryCode, secretary.person.phoneLocal) : maskPhone(secretary.person.phoneCountryCode, secretary.person.phoneLocal)}</div>
              <div className="text-black/60">Address: {showSensitive ? secretary.person.address : maskAddress(secretary.person.address)}</div>
            </div>
          ) : (
            <div className="text-black/40">-</div>
          )}
        </div>
      </AccordionItem>

      <AccordionItem title="Step 3 - Information confirmed" open={!!open.confirm} onToggle={() => setOpen((p) => ({ ...p, confirm: !p.confirm }))}>
        <div className="mt-2 space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={v.confirmInfoAccurate}
              onChange={(e) => set({ confirmInfoAccurate: e.target.checked })}
              className="h-4 w-4 mt-0.5"
            />
            <div className="text-black/70">All the information provided is true and correct.</div>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={v.confirmAuthorizedToSubmit}
              onChange={(e) => set({ confirmAuthorizedToSubmit: e.target.checked })}
              className="h-4 w-4 mt-0.5"
            />
            <div className="text-black/70">I am authorized to submit this application.</div>
          </label>
        </div>
      </AccordionItem>
    </div>
  );
}
