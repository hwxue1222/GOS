import Link from 'next/link';
import { formatDateDMY } from '@/lib/date';

export type AcraRecordRow = {
  id: string;
  typeKey: string;
  typeLabel: string;
  companyId: string;
  companyName: string;
  applicationDate: string;
  editDate: string;
  status: string;
  detailsHref: string;
  decisionUrl?: string;
  deleteUrl?: string;
};

function statusPill(s: string) {
  if (s === 'REJECTED') return 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]';
  if (s === 'NEED_MORE_INFO') return 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]';
  if (s === 'PENDING_REVIEW') return 'bg-[#faf5ff] text-[#6d28d9] border-[#e9d5ff]';
  if (s === 'DRAFT') return 'bg-black/[0.02] text-black/70 border-black/10';
  if (s === 'SIGNING') return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
  if (s === 'APPROVED' || s === 'COMPLETE' || s === 'COMPLETED') return 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]';
  return 'bg-white text-black/70 border-black/10';
}

function buildQuery(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const vv = String(v ?? '').trim();
    if (vv) sp.set(k, vv);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export default function AcraFilingRecordsTable(props: {
  companies: Array<{ id: string; name: string }>;
  allRows: AcraRecordRow[];
  visibleRows: AcraRecordRow[];
  filterCompanyId: string;
  filterType: string;
  filterStatus: string;
  canWrite: boolean;
}) {
  const actionBtnBase = 'rounded-md px-4 py-2 text-sm font-medium';
  const actionBtnSecondary = `${actionBtnBase} bg-white border border-black/10 text-black/70 hover:bg-black/[0.02]`;

  const chipBase = 'rounded-full px-3 py-1.5 border text-sm';
  const chipActive = `${chipBase} bg-black text-white border-black`;
  const chipInactive = `${chipBase} bg-white border-black/10 text-black/70 hover:bg-black/[0.02]`;

  const chipDefs: Array<{ typeKey: string; label: string }> = [
    { typeKey: '', label: 'All' },
    { typeKey: 'director_change', label: 'Change of Director' },
    { typeKey: 'share_transfer', label: 'Transfer of Shares' },
    { typeKey: 'rorc', label: 'RORC' },
    { typeKey: 'agm', label: 'AGM' },
    { typeKey: 'register_company', label: 'Register Company' },
    { typeKey: 'transfer_company_secretary', label: 'Transfer Secretary' },
    { typeKey: 'change_company_name', label: 'Change of Company Name' },
    { typeKey: 'change_fye', label: 'Change of FYE' },
    { typeKey: 'change_registered_office_address', label: 'Change of Address' },
    { typeKey: 'change_business_activities', label: 'Change of Activities' },
    { typeKey: 'change_secretary', label: 'Change of Secretary' },
  ];

  return (
    <div className="mt-4">
      <div className="rounded-xl bg-white border border-black/5 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="view" value="records" />
            {props.filterType ? <input type="hidden" name="type" value={props.filterType} /> : null}
            <div className="text-sm text-black/70">Company</div>
            <select
              name="companyId"
              defaultValue={props.filterCompanyId}
              className="max-w-[420px] truncate rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">All companies</option>
              {props.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="text-sm text-black/70 ml-0 md:ml-2">Status</div>
            <select
              name="status"
              defaultValue={props.filterStatus}
              className="max-w-[240px] truncate rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="SIGNING">Signing</option>
              <option value="PENDING_REVIEW">Pending review</option>
              <option value="NEED_MORE_INFO">Need more info</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="COMPLETED">Completed</option>
              <option value="COMPLETE">Complete</option>
              <option value="PROCESSING">Processing</option>
            </select>

            <button type="submit" className={actionBtnSecondary}>
              Apply
            </button>
            {(props.filterCompanyId || props.filterType || props.filterStatus) && (
              <Link href="/secretary/acra-filing?view=records" className="text-sm text-[#2f7bdc] hover:underline">
                Clear filters
              </Link>
            )}
          </form>

          <div className="text-xs text-black/50">
            Showing {props.visibleRows.length} of {props.allRows.length}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chipDefs.map((c) => {
            const href = `/secretary/acra-filing${buildQuery({
              view: 'records',
              type: c.typeKey || undefined,
              companyId: props.filterCompanyId || undefined,
              status: props.filterStatus || undefined,
            })}`;
            const cls = (props.filterType || '') === (c.typeKey || '') ? chipActive : !props.filterType && !c.typeKey ? chipActive : chipInactive;
            return (
              <Link key={c.typeKey || 'all'} href={href} className={cls}>
                {c.label}
              </Link>
            );
          })}
        </div>
      </div>

      {props.visibleRows.length === 0 ? (
        <div className="mt-4 rounded-xl bg-white border border-black/5 p-10 text-center">
          <div className="text-base font-semibold text-black">No applications</div>
          <div className="mt-2 text-sm text-black/50">Try adjusting filters.</div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-black/60 bg-black/[0.02]">
                <tr className="border-b border-black/10">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Company Name</th>
                  <th className="px-3 py-2 font-medium">Application Date</th>
                  <th className="px-3 py-2 font-medium">Edit Date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Operate</th>
                </tr>
              </thead>
              <tbody>
                {props.visibleRows.map((r) => (
                  <tr key={r.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="px-3 py-2">{r.typeLabel}</td>
                    <td className="px-3 py-2">{r.companyName}</td>
                    <td className="px-3 py-2">{formatDateDMY(r.applicationDate.slice(0, 10))}</td>
                    <td className="px-3 py-2">{formatDateDMY(r.editDate.slice(0, 10))}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusPill(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={r.detailsHref}
                          className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium hover:brightness-95"
                        >
                          Details
                        </Link>
                        {props.canWrite ? (
                          r.decisionUrl || r.deleteUrl ? (
                            <Link
                              href={`/secretary/acra-filing${buildQuery({ view: 'queue' })}`}
                              className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.02]"
                            >
                              Review
                            </Link>
                          ) : null
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
