'use client';

type EventRow = {
  id: string;
  fromStatus?: string;
  toStatus: string;
  note?: string;
  actorName: string;
  actorRole: string;
  createdAt: string;
};

export default function IncorporationTimelineSection(props: {
  events: EventRow[];
  busy: boolean;
  canReview: boolean;
  onSetStatus: (toStatus: 'PROCESSING' | 'NEED_MORE_INFO' | 'COMPLETED' | 'REJECTED') => void;
}) {
  return (
    <div className="rounded-xl bg-white border border-black/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Timeline</div>
          <div className="mt-0.5 text-xs text-black/50">Status changes & notes</div>
        </div>
        {props.canReview ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={props.busy}
              onClick={() => props.onSetStatus('PROCESSING')}
              className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              Mark processing
            </button>
            <button
              disabled={props.busy}
              onClick={() => props.onSetStatus('NEED_MORE_INFO')}
              className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              Need more info
            </button>
            <button
              disabled={props.busy}
              onClick={() => props.onSetStatus('COMPLETED')}
              className="rounded-md bg-[#46b35a] text-white px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              Complete
            </button>
            <button
              disabled={props.busy}
              onClick={() => props.onSetStatus('REJECTED')}
              className="rounded-md bg-[#dc2626] text-white px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {props.events.map((e) => (
          <div key={e.id} className="rounded-md bg-[#f8fafc] border border-black/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">
                {e.fromStatus ? `${e.fromStatus} → ` : ''}{e.toStatus}
              </div>
              <div className="text-xs text-black/50">{e.createdAt.slice(0, 19).replace('T', ' ')}</div>
            </div>
            <div className="mt-0.5 text-xs text-black/60">{e.actorName} ({e.actorRole})</div>
            {e.note ? <div className="mt-1 text-sm whitespace-pre-wrap">{e.note}</div> : null}
          </div>
        ))}
        {props.events.length === 0 ? <div className="text-sm text-black/40">No events</div> : null}
      </div>
    </div>
  );
}

