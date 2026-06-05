'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Row = { code: string; description: string };

type Props = {
  label: string;
  value?: string;
  disabled?: boolean;
  onChange: (code: string | undefined) => void;
  excludeCode?: string;
};

export default function SsicCombobox({ label, value, disabled, onChange, excludeCode }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const timer = useRef<number | null>(null);

  const shownValue = value ?? '';

  useEffect(() => {
    let cancelled = false;
    if (!shownValue) {
      setSelectedLabel('');
      return;
    }
    fetch(`/api/ssic?code=${encodeURIComponent(shownValue)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const it = (j?.item ?? null) as Row | null;
        setSelectedLabel(it ? `${it.code} - ${it.description}` : shownValue);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedLabel(shownValue);
      });
    return () => {
      cancelled = true;
    };
  }, [shownValue]);

  const filtered = useMemo(() => {
    if (!excludeCode) return items;
    return items.filter((x) => x.code !== excludeCode);
  }, [items, excludeCode]);

  function scheduleSearch(next: string) {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fetch(`/api/ssic?q=${encodeURIComponent(next)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const list = Array.isArray(j?.items) ? (j.items as Row[]) : [];
          setItems(list);
          setOpen(true);
        })
        .catch(() => {
          setItems([]);
          setOpen(true);
        });
    }, 250);
  }

  return (
    <label className="text-sm">
      <div className="text-black/60">{label}</div>
      <div className="mt-1 relative">
        <input
          value={open ? query : selectedLabel}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (!v.trim()) {
              setItems([]);
              setOpen(true);
              return;
            }
            scheduleSearch(v);
          }}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            if (!query.trim() && selectedLabel) setQuery('');
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
          }}
          disabled={disabled}
          placeholder="输入 SSIC code 或关键字"
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
        />

        {open && !disabled ? (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-black/10 bg-white shadow-sm max-h-64 overflow-auto">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(undefined);
                setQuery('');
                setItems([]);
                setSelectedLabel('');
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-black/2 text-black/60"
            >
              清空
            </button>
            {filtered.length ? (
              filtered.map((it) => (
                <button
                  key={it.code}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(it.code);
                    setSelectedLabel(`${it.code} - ${it.description}`);
                    setQuery('');
                    setItems([]);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-black/2"
                >
                  <div className="font-medium">{it.code}</div>
                  <div className="text-xs text-black/60">{it.description}</div>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-black/40">无匹配</div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}

