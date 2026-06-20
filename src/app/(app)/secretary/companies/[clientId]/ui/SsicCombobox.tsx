'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '@/components/I18nProviderClient';

type Row = { code: string; description: string };

type Props = {
  label: string;
  value?: string;
  disabled?: boolean;
  onChange: (code: string | undefined) => void;
  excludeCode?: string;
};

export default function SsicCombobox({ label, value, disabled, onChange, excludeCode }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const timer = useRef<number | null>(null);
  const pending = useRef<AbortController | null>(null);

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
      if (pending.current) pending.current.abort();
      pending.current = new AbortController();
      fetch(`/api/ssic?q=${encodeURIComponent(next)}`, { cache: 'no-store', signal: pending.current.signal })
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

  async function tryAutoSelect(next: string) {
    const s = next.trim();
    if (!/^\d{5}$/.test(s)) return false;
    try {
      if (pending.current) pending.current.abort();
      pending.current = new AbortController();
      const res = await fetch(`/api/ssic?code=${encodeURIComponent(s)}`, { cache: 'no-store', signal: pending.current.signal });
      if (!res.ok) return false;
      const j = (await res.json().catch(() => null)) as { item?: Row | null } | null;
      const it = (j?.item ?? null) as Row | null;
      if (!it) return false;
      if (excludeCode && it.code === excludeCode) return false;
      onChange(it.code);
      setSelectedLabel(`${it.code} - ${it.description}`);
      setQuery('');
      setItems([]);
      setOpen(false);
      return true;
    } catch {
      return false;
    }
  }

  function clearSelection() {
    onChange(undefined);
    setSelectedLabel('');
    setQuery('');
    setItems([]);
    setOpen(false);
  }

  const isSearching = open && query.trim().length > 0;

  return (
    <label className="text-sm">
      <div className="text-black/60">{label}</div>
      <div className="mt-1 relative">
        <input
          value={isSearching ? query : selectedLabel}
          onChange={(e) => {
            const v = e.target.value;
            if (shownValue && !open) return;
            setQuery(v);
            if (!v.trim()) {
              setItems([]);
              setOpen(false);
              return;
            }
            setOpen(true);
            void tryAutoSelect(v).then((picked) => {
              if (!picked) scheduleSearch(v);
            });
          }}
          onFocus={() => {
            if (disabled) return;
            if (shownValue) {
              setOpen(false);
              setQuery('');
              setItems([]);
              return;
            }
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => {
            if (!shownValue) return;
            if (disabled) return;
            if (e.key === 'Backspace' || e.key === 'Delete') {
              e.preventDefault();
              clearSelection();
            }
          }}
          disabled={disabled}
          placeholder={t('ssic.placeholder')}
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5 pr-10"
          readOnly={!!shownValue && !open}
        />

        {shownValue && !disabled ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => clearSelection()}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black/70"
            aria-label="Clear"
            title="Clear"
          >
            ×
          </button>
        ) : null}

        {isSearching && !disabled ? (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-black/10 bg-white shadow-sm max-h-64 overflow-auto">
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
              <div className="px-3 py-2 text-sm text-black/40">{t('common.noMatch')}</div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}
