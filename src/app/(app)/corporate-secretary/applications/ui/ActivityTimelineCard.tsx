import React from 'react';
import SectionCard from './SectionCard';

export type TimelineItem = {
  ts: string;
  title: string;
  detail?: string;
};

function formatTs(ts: string) {
  const s = String(ts ?? '').trim();
  if (!s) return '';
  return s.slice(0, 19).replace('T', ' ');
}

export default function ActivityTimelineCard(props: { items: TimelineItem[] }) {
  const items = props.items
    .filter((x) => !!String(x.ts ?? '').trim())
    .slice()
    .sort((a, b) => b.ts.localeCompare(a.ts));

  return (
    <SectionCard title="Activity" subtitle="Timeline of submissions, signatures, and decisions.">
      {items.length ? (
        <ol className="space-y-3">
          {items.map((it) => (
            <li key={`${it.ts}:${it.title}`} className="flex items-start gap-3">
              <div className="mt-1 h-2.5 w-2.5 rounded-full bg-black/20" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm text-black/80 truncate">{it.title}</div>
                  <div className="text-xs text-black/40">{formatTs(it.ts)}</div>
                </div>
                {it.detail ? <div className="mt-0.5 text-xs text-black/50 whitespace-pre-wrap">{it.detail}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="text-sm text-black/50">No activity yet</div>
      )}
    </SectionCard>
  );
}

