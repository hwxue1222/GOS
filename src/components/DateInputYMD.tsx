'use client';

import { useRef } from 'react';

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
    <div
      className={['relative', className].filter(Boolean).join(' ')}
      onMouseDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        openPicker();
      }}
      onClick={() => openPicker()}
    >
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        min={min}
        max={max}
        className={['w-full opacity-0', inputClassName].filter(Boolean).join(' ')}
      />
      <input
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        value={value || ''}
        placeholder={placeholder ?? 'YYYY-MM-DD'}
        className={['absolute inset-0 w-full pointer-events-none', inputClassName].filter(Boolean).join(' ')}
      />
    </div>
  );
}
