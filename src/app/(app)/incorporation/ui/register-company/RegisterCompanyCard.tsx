'use client';

import type { ReactNode } from 'react';

export function RegisterCompanyCard(props: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-black/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold">{props.title}</div>
        {props.right}
      </div>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

export function SectionActionButton(props: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-sm font-medium hover:bg-black/[0.02]"
    >
      {props.label}
    </button>
  );
}

