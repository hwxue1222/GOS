import React from 'react';
import SectionCard from './SectionCard';
import { formatDateDMY } from '@/lib/date';

export type KeyValueRow = { label: string; value: React.ReactNode };

function formatValue(v: React.ReactNode) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return formatDateDMY(v.trim());
  return v;
}

export default function KeyValueCard(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  rows: KeyValueRow[];
}) {
  return (
    <SectionCard title={props.title} subtitle={props.subtitle} right={props.right}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
        {props.rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3">
            <dt className="text-black/50">{r.label}</dt>
            <dd className="text-right text-black/80">{formatValue(r.value)}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
