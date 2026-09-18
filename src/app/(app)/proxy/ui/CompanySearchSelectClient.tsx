'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type CompanySearchSelectItem = {
  id: string;
  code: string;
  name: string;
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export default function CompanySearchSelectClient(props: {
  items: CompanySearchSelectItem[];
  placeholder?: string;
  helperText?: string;
  onSelect: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const needle = normalize(q);
    const base = needle
      ? props.items.filter((c) => {
          const hay = `${c.name} ${c.code}`.toLowerCase();
          return hay.includes(needle);
        })
      : props.items;
    return base.slice(0, 60);
  }, [props.items, q]);

  useEffect(() => {
    setActiveIndex(0);
  }, [q]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      const inInput = !!inputRef.current && inputRef.current.contains(t);
      const inList = !!listRef.current && listRef.current.contains(t);
      if (inInput || inList) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
    };
  }, []);

  function pick(itemId: string) {
    const hit = props.items.find((x) => x.id === itemId) ?? null;
    if (hit) setQ(`${hit.name} (${hit.code})`);
    setOpen(false);
    props.onSelect(itemId);
  }

  return (
    <div className="w-full sm:max-w-[520px]">
      <div className="relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === 'Enter') {
              if (!open) return;
              e.preventDefault();
              const it = filtered[activeIndex] ?? null;
              if (!it) return;
              pick(it.id);
            }
          }}
          placeholder={props.placeholder ?? ''}
          className="w-full truncate rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
        />

        {open ? (
          <div
            ref={listRef}
            className="absolute z-20 mt-1 w-full rounded-lg border border-black/10 bg-white shadow-lg max-h-72 overflow-auto"
          >
            {filtered.length ? (
              <ul className="py-1">
                {filtered.map((c, idx) => {
                  const active = idx === activeIndex;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => pick(c.id)}
                        className={[
                          'w-full text-left px-3 py-2 text-sm truncate',
                          active ? 'bg-[#2f7bdc] text-white' : 'hover:bg-black/[0.03] text-black/80',
                        ].join(' ')}
                      >
                        {c.name} ({c.code})
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-3 py-2 text-sm text-black/50">No results</div>
            )}
          </div>
        ) : null}
      </div>

      {props.helperText ? <div className="mt-2 text-xs text-black/50">{props.helperText}</div> : null}
    </div>
  );
}

