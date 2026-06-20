'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
  const ref = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const constraintText = useMemo(() => {
    const parts: string[] = [];
    if (min) parts.push(`≥ ${min}`);
    if (max) parts.push(`≤ ${max}`);
    return parts.length ? parts.join(' ') : undefined;
  }, [max, min]);

  function isValidYmd(v: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return false;
    return d.toISOString().slice(0, 10) === v;
  }

  function clampToRange(v: string) {
    if (min && v < min) return min;
    if (max && v > max) return max;
    return v;
  }

  function openPicker() {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    try {
      (el as unknown as { showPicker?: () => void }).showPicker?.();
    } catch {}
    try {
      el.focus();
    } catch {}
  }

  return (
    <div className={['relative', className].filter(Boolean).join(' ')}>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          onChange(next);
        }}
        disabled={disabled}
        min={min}
        max={max}
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
      />

      <input
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (isValidYmd(next)) onChange(clampToRange(next));
        }}
        onBlur={() => {
          const next = draft.trim();
          if (!next) {
            setDraft('');
            onChange('');
            return;
          }
          if (isValidYmd(next)) {
            const clamped = clampToRange(next);
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
        onClick={() => openPicker()}
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black/70 disabled:opacity-50"
        aria-label="Open calendar"
        title="Open calendar"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="fill-current">
          <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm12 6H5v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8ZM6 6h12V7H6V6Z" />
        </svg>
      </button>
    </div>
  );
}
