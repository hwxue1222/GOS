'use client';

import { useEffect, useMemo, useState } from 'react';

import { COUNTRY_OF_INCORPORATION_OPTIONS } from '@/lib/countryOfIncorporationOptions';

const OTHER_VALUE = '__OTHER__';

export default function CountryOfIncorporationSelect(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const options = COUNTRY_OF_INCORPORATION_OPTIONS;
  const raw = String(props.value ?? '');
  const current = raw.trim();
  const disabled = !!props.disabled;
  const placeholder = props.placeholder ?? 'Select...';

  const isCustom = useMemo(() => {
    if (!current) return false;
    return !options.includes(current as any);
  }, [current, options]);

  const [otherMode, setOtherMode] = useState(false);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    if (isCustom) {
      setOtherMode(true);
      setOtherText(current);
    } else if (!current) {
      setOtherMode(false);
      setOtherText('');
    }
  }, [current, isCustom]);

  const selectValue = otherMode ? OTHER_VALUE : current;

  return (
    <div className="space-y-2">
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') {
            setOtherMode(false);
            setOtherText('');
            props.onChange('');
            return;
          }
          if (v === OTHER_VALUE) {
            setOtherMode(true);
            const next = isCustom ? current : '';
            setOtherText(next);
            props.onChange(next);
            return;
          }
          setOtherMode(false);
          setOtherText('');
          props.onChange(v);
        }}
        disabled={disabled}
        className={props.className}
      >
        <option value="">{placeholder}</option>
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={OTHER_VALUE}>Others...</option>
      </select>

      {otherMode ? (
        <input
          value={otherText}
          onChange={(e) => {
            const v = e.target.value;
            setOtherText(v);
            props.onChange(v);
          }}
          disabled={disabled}
          placeholder="Type country"
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
        />
      ) : null}
    </div>
  );
}

