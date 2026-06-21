'use client';

import { useEffect, useRef } from 'react';

import type { Currency } from '@/lib/types';
import SsicCombobox from '@/app/(app)/secretary/companies/[clientId]/ui/SsicCombobox';

export default function TransferSecretaryStep1(props: {
  value: {
    companyName: string;
    companySuffix: string;
    companyRegistrationNo: string;
    paidUpCapitalAmount: string;
    paidUpCapitalCurrency: Currency;
    totalShares: string;
    ssicPrimaryCode: string;
    ssicSecondaryCode: string;
    address: string;
    useByBridgeRegisteredOfficeAddress: boolean;
  };
  onChange: (next: {
    companyName: string;
    companySuffix: string;
    companyRegistrationNo: string;
    paidUpCapitalAmount: string;
    paidUpCapitalCurrency: Currency;
    totalShares: string;
    ssicPrimaryCode: string;
    ssicSecondaryCode: string;
    address: string;
    useByBridgeRegisteredOfficeAddress: boolean;
  }) => void;
}) {
  const bbyRegisteredOfficeAddress = '8 Burn Road#15-03 Trivex Singapore 369977';
  const v = props.value;
  const set = (patch: Partial<typeof v>) => props.onChange({ ...v, ...patch });
  const prevManualAddressRef = useRef<string>('');
  const suffixOptions = ['Pte Ltd', 'Ltd', 'LLP', 'LP', 'Sole Proprietorship'];
  const currencyOptions: Array<{ label: string; value: Currency }> = [
    { label: 'Singapore Dollar(s$) S$', value: 'SGD' },
    { label: 'US Dollar($) USD', value: 'USD' },
    { label: 'Chinese Yuan(¥) CNY', value: 'CNY' },
    { label: 'Malaysian Ringgit(RM) MYR', value: 'MYR' },
  ];

  useEffect(() => {
    if (v.ssicPrimaryCode && v.ssicSecondaryCode && v.ssicPrimaryCode === v.ssicSecondaryCode) {
      props.onChange({ ...v, ssicSecondaryCode: '' });
    }
  }, [props, v, v.ssicPrimaryCode, v.ssicSecondaryCode]);

  useEffect(() => {
    if (v.useByBridgeRegisteredOfficeAddress && v.address.trim() !== bbyRegisteredOfficeAddress) {
      props.onChange({ ...v, address: bbyRegisteredOfficeAddress });
    }
  }, [bbyRegisteredOfficeAddress, props, v, v.address, v.useByBridgeRegisteredOfficeAddress]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm">
          <div className="text-black/60">
            <span className="text-red-600">*</span> Proposed Company Name
          </div>
          <div className="mt-1 flex gap-2">
            <input
              value={v.companyName}
              onChange={(e) => set({ companyName: e.target.value })}
              className="flex-1 rounded-md border border-black/10 px-3 py-2"
              placeholder="Please fill in in English"
            />
            <select
              value={v.companySuffix}
              onChange={(e) => set({ companySuffix: e.target.value })}
              className="w-[140px] rounded-md border border-black/10 bg-white px-3 py-2"
            >
              {suffixOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="text-sm">
          <div className="text-black/60">
            <span className="text-red-600">*</span> Register Number
          </div>
          <input
            value={v.companyRegistrationNo}
            onChange={(e) => set({ companyRegistrationNo: e.target.value })}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
            placeholder="e.g. 201912345A"
          />
        </label>

        <label className="text-sm">
          <div className="text-black/60">
            <span className="text-red-600">*</span> Registered Share Capital
          </div>
          <div className="mt-1 flex gap-2">
            <select
              value={v.paidUpCapitalCurrency}
              onChange={(e) => set({ paidUpCapitalCurrency: e.target.value as Currency })}
              className="w-[220px] rounded-md border border-black/10 bg-white px-3 py-2"
            >
              {currencyOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              value={v.paidUpCapitalAmount}
              onChange={(e) => set({ paidUpCapitalAmount: e.target.value })}
              className="flex-1 rounded-md border border-black/10 px-3 py-2"
              inputMode="decimal"
              placeholder=""
            />
          </div>
        </label>

        <label className="text-sm">
          <div className="text-black/60">
            <span className="text-red-600">*</span> Total Number Of Shares
          </div>
          <input
            value={v.totalShares}
            onChange={(e) => set({ totalShares: e.target.value })}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
            inputMode="numeric"
            placeholder=""
          />
        </label>

        <div>
          <SsicCombobox
            label="Activity 1"
            value={v.ssicPrimaryCode || undefined}
            onChange={(code) => {
              const nextPrimary = code ?? '';
              const nextSecondary = nextPrimary && nextPrimary === v.ssicSecondaryCode ? '' : v.ssicSecondaryCode;
              set({ ssicPrimaryCode: nextPrimary, ssicSecondaryCode: nextSecondary });
            }}
          />
        </div>

        <div>
          <SsicCombobox
            label="Activity 2"
            value={v.ssicSecondaryCode || undefined}
            excludeCode={v.ssicPrimaryCode || undefined}
            onChange={(code) => {
              const next = code ?? '';
              set({ ssicSecondaryCode: next && next === v.ssicPrimaryCode ? '' : next });
            }}
          />
        </div>

        <label className="text-sm sm:col-span-2">
          <div className="text-black/60">
            <span className="text-red-600">*</span> Company Address
          </div>
          <textarea
            value={v.address}
            onChange={(e) => set({ address: e.target.value })}
            disabled={v.useByBridgeRegisteredOfficeAddress}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 min-h-[96px] disabled:bg-black/5"
            placeholder="Singapore Address"
          />
        </label>

        <label className="text-sm sm:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={v.useByBridgeRegisteredOfficeAddress}
            onChange={(e) => {
              const checked = e.target.checked;
              if (checked) {
                if (v.address.trim() && v.address.trim() !== bbyRegisteredOfficeAddress) prevManualAddressRef.current = v.address;
                set({ useByBridgeRegisteredOfficeAddress: true, address: bbyRegisteredOfficeAddress });
              } else {
                set({ useByBridgeRegisteredOfficeAddress: false, address: prevManualAddressRef.current || v.address });
              }
            }}
            className="h-4 w-4"
          />
          <div className="text-black/70">To use ByBridge registered office address</div>
        </label>
      </div>
    </div>
  );
}
