'use client';

import { useId } from 'react';

export function AccordionItem(props: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const contentId = useId();
  return (
    <div className="rounded-xl border border-black/10 overflow-hidden">
      <button
        type="button"
        onClick={props.onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-black/[0.02]"
        aria-expanded={props.open}
        aria-controls={contentId}
      >
        <div className="min-w-0 flex items-center gap-3">
          <span className="text-sm font-semibold text-black truncate">{props.title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {props.right}
          <span className="text-xs text-black/50">{props.open ? 'Hide' : 'Show'}</span>
        </div>
      </button>
      {props.open ? (
        <div id={contentId} className="px-4 pb-4">
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

