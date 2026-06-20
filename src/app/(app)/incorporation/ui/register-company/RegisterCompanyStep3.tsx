'use client';

import { useMemo, useState } from 'react';

import type { RegisterCompanyDraft } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';
import { AccordionItem } from '@/app/(app)/incorporation/ui/register-company/Accordion';
import { maskAddress, maskDob, maskEmail, maskName, maskNationality, maskPhone } from '@/lib/mask';

export default function RegisterCompanyStep3(props: {
  draft: RegisterCompanyDraft;
  companyNameFull: string;
  files?: File[];
  onChangeFiles?: (next: File[]) => void;
  value: RegisterCompanyDraft['step3'];
  onChange: (next: RegisterCompanyDraft['step3']) => void;
}) {
  const v = props.value;
  const set = (patch: Partial<typeof v>) => props.onChange({ ...v, ...patch });
  const d = props.draft;
  const onChangeFiles = props.onChangeFiles;

  const [open, setOpen] = useState<Record<string, boolean>>({ step1: true, shareholders: true, directors: false, rorc: false, secretary: false, files: true, confirm: true });
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

      <AccordionItem
        title="Step 1 - Basic information"
        open={!!open.step1}
        onToggle={() => setOpen((p) => ({ ...p, step1: !p.step1 }))}
      >
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-black/50">Company</div>
            <div className="mt-1 font-medium">{props.companyNameFull || '-'}</div>
          </div>
          <div>
            <div className="text-black/50">Alternative Name</div>
            <div className="mt-1 font-medium">{d.step1.alternativeName ? `${d.step1.alternativeName} ${d.step1.alternativeSuffix}` : '-'}</div>
          </div>
          <div>
            <div className="text-black/50">Registered Share Capital</div>
            <div className="mt-1 font-medium">{d.step1.paidUpCapitalAmount ? `${d.step1.paidUpCapitalCurrency} ${d.step1.paidUpCapitalAmount}` : '-'}</div>
          </div>
          <div>
            <div className="text-black/50">Total Shares</div>
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
            <div className="mt-1 font-medium whitespace-pre-wrap">{d.step1.address || '-'}</div>
          </div>
          <div>
            <div className="text-black/50">Use BBY registered office</div>
            <div className="mt-1 font-medium">{d.step1.useByBridgeRegisteredOfficeAddress ? 'Yes' : 'No'}</div>
          </div>
        </div>
      </AccordionItem>

      <AccordionItem
        title={`Shareholders (${d.step2.shareholders.length})`}
        open={!!open.shareholders}
        onToggle={() => setOpen((p) => ({ ...p, shareholders: !p.shareholders }))}
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
                    {s.kind === 'PERSON'
                      ? showSensitive
                        ? s.fullName
                        : maskName(s.fullName)
                      : s.companyName}
                  </td>
                  <td className="px-3 py-2">{s.shares || '-'}</td>
                  <td className="px-3 py-2">
                    {s.kind === 'PERSON'
                      ? showSensitive
                        ? s.idNo
                        : maskIdNo(s.idNo)
                      : showSensitive
                        ? s.registrationNo
                        : maskIdNo(s.registrationNo)}
                  </td>
                  <td className="px-3 py-2">
                    {s.kind === 'PERSON'
                      ? showSensitive
                        ? s.email
                        : maskEmail(s.email)
                      : showSensitive
                        ? s.email
                        : maskEmail(s.email)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccordionItem>

      <AccordionItem
        title={`Directors (${d.step2.directors.length})`}
        open={!!open.directors}
        onToggle={() => setOpen((p) => ({ ...p, directors: !p.directors }))}
      >
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60 bg-black/[0.02]">
              <tr className="border-b border-black/10">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">DOB</th>
                <th className="px-3 py-2 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {directors.map((p, idx) => (
                <tr key={`${p.idNo}-${idx}`} className="border-b border-black/5">
                  <td className="px-3 py-2">{showSensitive ? p.fullName : maskName(p.fullName)}</td>
                  <td className="px-3 py-2">{showSensitive ? p.idNo : maskIdNo(p.idNo)}</td>
                  <td className="px-3 py-2">{showSensitive ? p.email : maskEmail(p.email)}</td>
                  <td className="px-3 py-2">{showSensitive ? p.dob : maskDob(p.dob)}</td>
                  <td className="px-3 py-2">
                    {showSensitive ? formatPhone(p.phoneCountryCode, p.phoneLocal) : maskPhone(p.phoneCountryCode, p.phoneLocal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccordionItem>

      <AccordionItem
        title={`RORC Controllers (${d.step2.rorcControllers.length})`}
        open={!!open.rorc}
        onToggle={() => setOpen((p) => ({ ...p, rorc: !p.rorc }))}
      >
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60 bg-black/[0.02]">
              <tr className="border-b border-black/10">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Initiation At</th>
              </tr>
            </thead>
            <tbody>
              {controllers.map((p, idx) => (
                <tr key={`${p.idNo}-${idx}`} className="border-b border-black/5">
                  <td className="px-3 py-2">{showSensitive ? p.fullName : maskName(p.fullName)}</td>
                  <td className="px-3 py-2">{showSensitive ? p.idNo : maskIdNo(p.idNo)}</td>
                  <td className="px-3 py-2">{showSensitive ? p.email : maskEmail(p.email)}</td>
                  <td className="px-3 py-2">{p.initiationAt || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccordionItem>

      <AccordionItem
        title="Secretary"
        open={!!open.secretary}
        onToggle={() => setOpen((p) => ({ ...p, secretary: !p.secretary }))}
      >
        {secretary.useByBridge || !secretary.person ? (
          <div className="mt-3 text-sm text-black/70">BBY company secretary</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-black/50">Name</div>
              <div className="mt-1 font-medium">{showSensitive ? secretary.person.fullName : maskName(secretary.person.fullName)}</div>
            </div>
            <div>
              <div className="text-black/50">ID</div>
              <div className="mt-1 font-medium">{showSensitive ? secretary.person.idNo : maskIdNo(secretary.person.idNo)}</div>
            </div>
            <div>
              <div className="text-black/50">Email</div>
              <div className="mt-1 font-medium">{showSensitive ? secretary.person.email : maskEmail(secretary.person.email)}</div>
            </div>
            <div>
              <div className="text-black/50">DOB</div>
              <div className="mt-1 font-medium">{showSensitive ? secretary.person.dob : maskDob(secretary.person.dob)}</div>
            </div>
            <div>
              <div className="text-black/50">Nationality</div>
              <div className="mt-1 font-medium">{showSensitive ? secretary.person.nationality : maskNationality(secretary.person.nationality)}</div>
            </div>
            <div>
              <div className="text-black/50">Phone</div>
              <div className="mt-1 font-medium">
                {showSensitive
                  ? formatPhone(secretary.person.phoneCountryCode, secretary.person.phoneLocal)
                  : maskPhone(secretary.person.phoneCountryCode, secretary.person.phoneLocal)}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-black/50">Address</div>
              <div className="mt-1 font-medium whitespace-pre-wrap">{showSensitive ? secretary.person.address : maskAddress(secretary.person.address)}</div>
            </div>
          </div>
        )}
      </AccordionItem>

      {onChangeFiles ? (
        <AccordionItem
          title={`Materials (${props.files?.length ?? 0})`}
          open={!!open.files}
          onToggle={() => setOpen((p) => ({ ...p, files: !p.files }))}
        >
          <div className="mt-3">
            <input type="file" multiple onChange={(e) => onChangeFiles(Array.from(e.target.files ?? []))} className="block w-full text-sm" />
            {props.files?.length ? <div className="mt-2 text-xs text-black/50">{props.files.map((f) => f.name).join(', ')}</div> : null}
          </div>
        </AccordionItem>
      ) : null}

      <AccordionItem
        title="Confirm"
        open={!!open.confirm}
        onToggle={() => setOpen((p) => ({ ...p, confirm: !p.confirm }))}
      >
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 text-sm text-black/80">
            <input type="checkbox" checked={v.confirmInfoAccurate} onChange={(e) => set({ confirmInfoAccurate: e.target.checked })} className="mt-1 h-4 w-4" />
            <span>
              All the information I filled are true and correct, and I have not concealed anything. if there is any false or concealment statement, I'm
              willing to take full responsibility.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-black/80">
            <input type="checkbox" checked={v.confirmAuthorizedToSubmit} onChange={(e) => set({ confirmAuthorizedToSubmit: e.target.checked })} className="mt-1 h-4 w-4" />
            <span>
              As an authorized representative of the company, I have read BBY KYC questionnaire (Click to download) Statement that it believes
              that there is no violation of any of its provision and that is has no relations or business dealings with prohibited countries and
              organizations, The actual controllers, Shareholders and directors of the company and their direct relatives are not politically exposed
              persons or persons subject to political risks impact.
            </span>
          </label>
        </div>
      </AccordionItem>
    </div>
  );
}
