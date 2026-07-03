'use client';

import type { DirectorChangeRequestItem } from '@/app/(app)/secretary/companies/[clientId]/ui/DirectorChangeRequestsPanel';

type RequestStatus =
  | 'DRAFT'
  | 'PENDING_SIGNATURES'
  | 'PENDING_REVIEW'
  | 'NEED_MORE_INFO'
  | 'APPROVED'
  | 'REJECTED';

function statusClass(s: RequestStatus) {
  if (s === 'PENDING_SIGNATURES') return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
  if (s === 'PENDING_REVIEW') return 'bg-[#faf5ff] text-[#6d28d9] border-[#e9d5ff]';
  if (s === 'NEED_MORE_INFO') return 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]';
  if (s === 'APPROVED') return 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]';
  if (s === 'REJECTED') return 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]';
  return 'bg-white text-black/70 border-black/10';
}

export default function DirectorChangeRequestsHistory(props: {
  items: DirectorChangeRequestItem[];
  directorByRoleId: Map<string, { roleId: string; fullName: string; email?: string }>;
  loading: boolean;
  canApprove: boolean;
  onDecide: (requestId: string, decision: 'APPROVE' | 'REJECT') => void;
}) {
  const { items, directorByRoleId, loading, canApprove, onDecide } = props;

  return (
    <div>
      <div className="text-sm font-medium">History</div>
      {loading ? <div className="mt-2 text-sm text-black/50">Loading...</div> : null}

      {!loading && items.length ? (
        <div className="mt-2 space-y-2">
          {items.map((it) => {
            const r = it.request;
            const removedNames = r.removeDirectorRoleIds
              .map((id) => directorByRoleId.get(id)?.fullName)
              .filter(Boolean)
              .join(', ');
            const addedNames = r.addDirectors.map((d) => d.fullName).join(', ');

            return (
              <details key={r.id} className="rounded-lg border border-black/5 bg-white">
                <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.id}</div>
                    <div className="mt-0.5 text-xs text-black/50">
                      {r.effectiveDate} · signatures {it.signatureSummary.signed}/{it.signatureSummary.total}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-xs ${statusClass(r.status)}`}>{r.status}</span>
                </summary>
                <div className="px-3 pb-3">
                  <div className="text-xs text-black/60">Created: {r.createdAt.slice(0, 19).replace('T', ' ')}</div>
                  {removedNames ? <div className="mt-2 text-sm"><span className="text-black/50">Remove:</span> {removedNames}</div> : null}
                  {addedNames ? <div className="mt-1 text-sm"><span className="text-black/50">Add:</span> {addedNames}</div> : null}
                  {r.message?.trim() ? <div className="mt-2 text-sm whitespace-pre-wrap">{r.message}</div> : null}

                  <div className="mt-3">
                    <div className="text-sm font-medium">Signatures</div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {it.signatures.map((s) => (
                        <div key={s.email} className="rounded-md bg-[#f8fafc] border border-black/5 px-3 py-2">
                          <div className="text-sm font-medium truncate">{s.email}</div>
                          <div className="mt-0.5 text-xs text-black/50">
                            {s.status}{s.signedAt ? ` · ${s.signedAt.slice(0, 19).replace('T', ' ')}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {canApprove && r.status === 'PENDING_REVIEW' ? (
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={() => onDecide(r.id, 'APPROVE')}
                        className="rounded-md bg-[#46b35a] text-white px-4 py-2 text-sm font-medium"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => onDecide(r.id, 'REJECT')}
                        className="rounded-md bg-[#dc2626] text-white px-4 py-2 text-sm font-medium"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      ) : null}

      {!loading && !items.length ? <div className="mt-2 text-sm text-black/50">No requests</div> : null}
    </div>
  );
}
