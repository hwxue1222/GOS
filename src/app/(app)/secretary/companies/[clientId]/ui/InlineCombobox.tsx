'use client';

import { useMemo, useRef, useState } from 'react';

type Option = {
  value: string;
  label: string;
  description?: string;
  searchText: string;
};

type Props = {
  label?: string;
  placeholder: string;
  value?: string;
  disabled?: boolean;
  options: Option[];
  onChange: (value: string | undefined) => void;
  maxItems?: number;
};

export default function InlineCombobox({ label, placeholder, value, disabled, options, onChange, maxItems }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const selected = useMemo(() => {
    if (!value) return null;
    return options.find((o) => o.value === value) ?? null;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const limit = typeof maxItems === 'number' ? maxItems : 50;
    if (!q) return options.slice(0, limit);
    return options
      .filter((o) => o.searchText.includes(q))
      .slice(0, limit);
  }, [options, query, maxItems]);

  function setQueryDebounced(v: string) {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setQuery(v), 0);
  }

  return (
    <div className="text-sm">
      {label ? <div className="text-black/60">{label}</div> : null}
      <div className={label ? 'mt-1 relative' : 'relative'}>
        <input
          value={open ? query : selected ? `${selected.label}${selected.description ? ` (${selected.description})` : ''}` : ''}
          onChange={(e) => {
            const v = e.target.value;
            setQueryDebounced(v);
            setOpen(true);
          }}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            if (!query) setQuery('');
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:bg-black/5"
        />

        {open && !disabled ? (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-black/10 bg-white shadow-sm max-h-64 overflow-auto">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(undefined);
                setQuery('');
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-black/2 text-black/60"
            >
              请选择
            </button>
            {filtered.length ? (
              filtered.map((it) => (
                <button
                  key={it.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(it.value);
                    setQuery('');
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-black/2"
                >
                  <div className="font-medium">{it.label}</div>
                  {it.description ? <div className="text-xs text-black/60">{it.description}</div> : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-black/40">无匹配</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

