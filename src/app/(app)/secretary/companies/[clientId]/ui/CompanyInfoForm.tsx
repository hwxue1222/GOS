'use client';

import SsicCombobox from '@/app/(app)/secretary/companies/[clientId]/ui/SsicCombobox';
import { useI18n } from '@/components/I18nProviderClient';

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
};

type Props = {
  client: Client;
  onChange: (patch: Partial<Client>) => void;
  canEdit: boolean;
};

function money(currency?: string, amount?: number) {
  if (!currency || typeof amount !== 'number' || !Number.isFinite(amount)) return '';
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CompanyInfoForm({ client, onChange, canEdit }: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-black/5 p-5">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">Company Info</div>
          {client.isStruckOff ? (
            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
              Struck Off
            </span>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-black/60">Company Name</div>
            <input
              value={client.name}
              onChange={(e) => onChange({ name: e.target.value })}
              disabled
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-black/5 text-black/70"
            />
          </label>
          <label className="text-sm">
            <div className="text-black/60">FKA (Formerly known as)</div>
            <input
              value={client.fka ?? ''}
              onChange={(e) => onChange({ fka: e.target.value || undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
            />
          </label>
          <label className="text-sm">
            <div className="text-black/60">Code</div>
            <input
              value={client.code}
              onChange={(e) => onChange({ code: e.target.value })}
              disabled
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-black/5 text-black/70"
            />
          </label>
          <label className="text-sm">
            <div className="text-black/60">Reg No.</div>
            <input
              value={client.companyRegistrationNo ?? ''}
              onChange={(e) => onChange({ companyRegistrationNo: e.target.value || undefined })}
              disabled
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-black/5 text-black/70"
            />
          </label>
          <label className="text-sm">
            <div className="text-black/60">FYE</div>
            <input
              value={client.fye ?? ''}
              onChange={(e) => onChange({ fye: e.target.value || undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
            />
          </label>
          <label className="text-sm">
            <div className="text-black/60">Contact</div>
            <input
              value={client.contactPerson ?? ''}
              onChange={(e) => onChange({ contactPerson: e.target.value || undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
            />
          </label>
          <label className="text-sm">
            <div className="text-black/60">Email</div>
            <input
              value={client.email ?? ''}
              onChange={(e) => onChange({ email: e.target.value || undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <div className="text-black/60">Address</div>
            <input
              value={client.address ?? ''}
              onChange={(e) => onChange({ address: e.target.value || undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-black/5 p-5">
        <div className="text-sm font-semibold">{t('company.extendedFields')}</div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-black/60">{t('company.paidUpCapitalCurrency')}</div>
            <select
              value={client.paidUpCapitalCurrency ?? ''}
              onChange={(e) => onChange({ paidUpCapitalCurrency: e.target.value || undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:bg-black/5"
            >
              <option value="">-</option>
              <option value="SGD">SGD</option>
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
              <option value="MYR">MYR</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="text-black/60">{t('company.paidUpCapitalAmount')}</div>
            <input
              value={typeof client.paidUpCapitalAmount === 'number' ? String(client.paidUpCapitalAmount) : ''}
              onChange={(e) => onChange({ paidUpCapitalAmount: e.target.value.trim() ? Number(e.target.value) : undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
              inputMode="decimal"
            />
            <div className="mt-1 text-xs text-black/40">{money(client.paidUpCapitalCurrency, client.paidUpCapitalAmount) || ''}</div>
          </label>
          <label className="text-sm">
            <div className="text-black/60">{t('company.totalShares')}</div>
            <input
              value={typeof client.totalShares === 'number' ? String(client.totalShares) : ''}
              onChange={(e) => onChange({ totalShares: e.target.value.trim() ? Number(e.target.value) : undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
              inputMode="numeric"
            />
          </label>
          <label className="text-sm">
            <div className="text-black/60">{t('company.incorporationDate')}</div>
            <input
              value={client.incorporationDate ?? ''}
              onChange={(e) => onChange({ incorporationDate: e.target.value || undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
              placeholder="YYYY-MM-DD"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <div className="text-black/60">{t('company.registeredOfficeAddress')}</div>
            <input
              value={client.registeredOfficeAddress ?? ''}
              onChange={(e) => onChange({ registeredOfficeAddress: e.target.value || undefined })}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
            />
          </label>
          <SsicCombobox
            label="Business activities (Primary)"
            value={client.ssicPrimaryCode}
            excludeCode={client.ssicSecondaryCode}
            disabled={!canEdit}
            onChange={(code) => onChange({ ssicPrimaryCode: code })}
          />
          <SsicCombobox
            label="Business activities (Secondary)"
            value={client.ssicSecondaryCode}
            excludeCode={client.ssicPrimaryCode}
            disabled={!canEdit}
            onChange={(code) => onChange({ ssicSecondaryCode: code })}
          />
        </div>
      </div>
    </div>
  );
}
