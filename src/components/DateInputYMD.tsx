'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function isValidYmd(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === v;
}

function clampToRange(v: string, min?: string, max?: string) {
  if (min && v < min) return min;
  if (max && v > max) return max;
  return v;
}

function toYmdUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function todayYmdUTC() {
  return toYmdUTC(new Date());
}

function ymdToUTCDate(ymd: string) {
  if (!isValidYmd(ymd)) return null;
  return new Date(`${ymd}T00:00:00.000Z`);
}

function monthStartUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonthsUTC(d: Date, delta: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
}

function addYearsUTC(d: Date, delta: number) {
  return new Date(Date.UTC(d.getUTCFullYear() + delta, d.getUTCMonth(), 1));
}

export function DateInputYMD(props: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}) {
  const { value, onChange, disabled, min, max, className, inputClassName, placeholder } = props;
  const [draft, setDraft] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'day' | 'month' | 'year'>('day');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const constraintText = useMemo(() => {
    const parts: string[] = [];
    if (min) parts.push(`≥ ${min}`);
    if (max) parts.push(`≤ ${max}`);
    return parts.length ? parts.join(' ') : undefined;
  }, [max, min]);

  const selectedDate = useMemo(() => ymdToUTCDate(value), [value]);
  const [cursor, setCursor] = useState(() => {
    const initial = ymdToUTCDate(value) ?? ymdToUTCDate(clampToRange(todayYmdUTC(), min, max)) ?? new Date();
    return monthStartUTC(initial);
  });

  useEffect(() => {
    if (!open) return;
    const next = ymdToUTCDate(value) ?? ymdToUTCDate(clampToRange(todayYmdUTC(), min, max)) ?? new Date();
    setCursor(monthStartUTC(next));
  }, [open, value, min, max]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const y = cursor.getUTCFullYear();
  const m = cursor.getUTCMonth();
  const monthTitle = `${monthLabels[m]} ${y}`;

  const yearPageStart = useMemo(() => {
    const base = y - 6;
    return base;
  }, [y]);

  const dayCells = useMemo(() => {
    const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const start = new Date(Date.UTC(y, m, 1 - firstDow));
    const cells: Array<{ ymd: string; day: number; inMonth: boolean; disabled: boolean; selected: boolean }> = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start.getTime() + i * 86400000);
      const ymd = toYmdUTC(d);
      const inMonth = d.getUTCMonth() === m;
      const dis = (min && ymd < min) || (max && ymd > max);
      const sel = ymd === value;
      cells.push({ ymd, day: d.getUTCDate(), inMonth, disabled: !!dis, selected: sel });
    }
    return cells;
  }, [m, max, min, value, y]);

  function pickDate(ymd: string) {
    const clamped = clampToRange(ymd, min, max);
    setDraft(clamped);
    onChange(clamped);
    setOpen(false);
    setView('day');
  }

  const monthCells = useMemo(() => {
    return monthLabels.map((label, idx) => ({ idx, label }));
  }, []);

  const yearCells = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => yearPageStart + i);
  }, [yearPageStart]);

  function openCalendar() {
    if (disabled) return;
    setOpen((p) => !p);
    setView('day');
  }

  return (
    <div ref={rootRef} className={['relative', className].filter(Boolean).join(' ')}>
      <input
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (isValidYmd(next)) onChange(clampToRange(next, min, max));
        }}
        onBlur={() => {
          const next = draft.trim();
          if (!next) {
            setDraft('');
            onChange('');
            return;
          }
          if (isValidYmd(next)) {
            const clamped = clampToRange(next, min, max);
            setDraft(clamped);
            onChange(clamped);
          } else {
            setDraft(value || '');
          }
        }}
        disabled={disabled}
        inputMode="numeric"
        placeholder={placeholder ?? 'YYYY-MM-DD'}
        className={['w-full pr-10', inputClassName].filter(Boolean).join(' ')}
        aria-description={constraintText}
      />

      <button
        type="button"
        onClick={() => openCalendar()}
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black/70 disabled:opacity-50"
        aria-label="Open calendar"
        title="Open calendar"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="fill-current">
          <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm12 6H5v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8ZM6 6h12V7H6V6Z" />
        </svg>
      </button>

      {open && !disabled ? (
        <div className="absolute z-30 mt-2 w-[320px] rounded-xl border border-black/10 bg-white shadow-lg p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {view === 'day' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCursor((p) => addYearsUTC(p, -1))}
                    className="h-7 w-7 rounded-md border border-black/10 text-black/60 hover:bg-black/[0.03]"
                    aria-label="Previous year"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    onClick={() => setCursor((p) => addMonthsUTC(p, -1))}
                    className="h-7 w-7 rounded-md border border-black/10 text-black/60 hover:bg-black/[0.03]"
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                </>
              ) : view === 'month' ? (
                <button
                  type="button"
                  onClick={() => setCursor((p) => addYearsUTC(p, -1))}
                  className="h-7 w-7 rounded-md border border-black/10 text-black/60 hover:bg-black/[0.03]"
                  aria-label="Previous year"
                >
                  ‹
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCursor((p) => addYearsUTC(p, -12))}
                  className="h-7 w-7 rounded-md border border-black/10 text-black/60 hover:bg-black/[0.03]"
                  aria-label="Previous years"
                >
                  ‹
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setView((p) => (p === 'day' ? 'month' : p === 'month' ? 'year' : 'month'))}
              className="text-sm font-semibold text-black hover:underline"
            >
              {view === 'day' ? monthTitle : view === 'month' ? String(y) : `${yearPageStart} - ${yearPageStart + 11}`}
            </button>

            <div className="flex items-center gap-1">
              {view === 'day' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCursor((p) => addMonthsUTC(p, 1))}
                    className="h-7 w-7 rounded-md border border-black/10 text-black/60 hover:bg-black/[0.03]"
                    aria-label="Next month"
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setCursor((p) => addYearsUTC(p, 1))}
                    className="h-7 w-7 rounded-md border border-black/10 text-black/60 hover:bg-black/[0.03]"
                    aria-label="Next year"
                  >
                    »
                  </button>
                </>
              ) : view === 'month' ? (
                <button
                  type="button"
                  onClick={() => setCursor((p) => addYearsUTC(p, 1))}
                  className="h-7 w-7 rounded-md border border-black/10 text-black/60 hover:bg-black/[0.03]"
                  aria-label="Next year"
                >
                  ›
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCursor((p) => addYearsUTC(p, 12))}
                  className="h-7 w-7 rounded-md border border-black/10 text-black/60 hover:bg-black/[0.03]"
                  aria-label="Next years"
                >
                  ›
                </button>
              )}
            </div>
          </div>

          {view === 'day' ? (
            <div className="mt-3">
              <div className="grid grid-cols-7 gap-1 text-xs text-black/50">
                {weekdayLabels.map((w) => (
                  <div key={w} className="h-7 flex items-center justify-center">
                    {w}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {dayCells.map((c) => (
                  <button
                    key={c.ymd}
                    type="button"
                    disabled={c.disabled}
                    onClick={() => pickDate(c.ymd)}
                    className={
                      'h-9 rounded-md text-sm ' +
                      (c.selected
                        ? 'bg-[#2f7bdc] text-white'
                        : c.inMonth
                          ? 'text-black hover:bg-black/[0.03]'
                          : 'text-black/30 hover:bg-black/[0.03]') +
                      (c.disabled ? ' opacity-40 cursor-not-allowed' : '')
                    }
                  >
                    {c.day}
                  </button>
                ))}
              </div>
            </div>
          ) : view === 'month' ? (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {monthCells.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    setCursor(new Date(Date.UTC(y, c.idx, 1)));
                    setView('day');
                  }}
                  className={
                    'rounded-md border border-black/10 px-2 py-2 text-sm hover:bg-black/[0.03] ' +
                    (c.idx === m ? 'bg-black/[0.03] font-semibold text-black' : 'text-black/70')
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {yearCells.map((yy) => (
                <button
                  key={yy}
                  type="button"
                  onClick={() => {
                    setCursor(new Date(Date.UTC(yy, m, 1)));
                    setView('month');
                  }}
                  className={
                    'rounded-md border border-black/10 px-2 py-2 text-sm hover:bg-black/[0.03] ' +
                    (yy === y ? 'bg-black/[0.03] font-semibold text-black' : 'text-black/70')
                  }
                >
                  {yy}
                </button>
              ))}
            </div>
          )}

          {selectedDate ? (
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setDraft('');
                  onChange('');
                  setOpen(false);
                  setView('day');
                }}
                className="text-xs text-black/60 hover:underline"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  const base = ymdToUTCDate(clampToRange(todayYmdUTC(), min, max)) ?? new Date();
                  pickDate(toYmdUTC(base));
                }}
                className="text-xs text-[#2f7bdc] hover:underline"
              >
                Today
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  const base = ymdToUTCDate(clampToRange(todayYmdUTC(), min, max)) ?? new Date();
                  pickDate(toYmdUTC(base));
                }}
                className="text-xs text-[#2f7bdc] hover:underline"
              >
                Today
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
