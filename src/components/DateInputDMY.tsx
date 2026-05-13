'use client';

import { formatDateDMY } from '@/lib/date';

export function DateInputDMY(props: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const { value, onChange, disabled, className, inputClassName } = props;

  return (
    <div className={['relative', className].filter(Boolean).join(' ')}>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={['w-full opacity-0', inputClassName].filter(Boolean).join(' ')}
      />
      <input
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        value={value ? formatDateDMY(value) : ''}
        placeholder="DD/MM/YYYY"
        className={['absolute inset-0 w-full pointer-events-none', inputClassName].filter(Boolean).join(' ')}
      />
    </div>
  );
}
