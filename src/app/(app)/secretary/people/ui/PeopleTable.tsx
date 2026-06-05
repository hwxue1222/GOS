'use client';

type Person = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  idNo?: string;
  nationality?: string;
  dob?: string;
  address?: string;
  memberSince?: string;
  lastLoginDate?: string;
  roleTags?: Array<'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY'>;
  roleLabels?: string[];
  companyCount?: number;
  createdAt: string;
};

function tagClass(label: string) {
  if (label === '董事') return 'bg-blue-50 text-blue-700 border-blue-100';
  if (label === '股东') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (label === '秘书') return 'bg-purple-50 text-purple-700 border-purple-100';
  if (label === 'RORC') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-black/5 text-black/70 border-black/10';
}

type Props = {
  people: Person[];
  loading: boolean;
};

export default function PeopleTable({ people, loading }: Props) {
  return (
    <div className="mt-6 rounded-xl bg-white border border-black/5 overflow-x-auto">
      <table className="min-w-[1650px] w-full text-sm">
        <thead className="bg-black/2">
          <tr className="text-left text-black/60">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">标签</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Nationality</th>
            <th className="px-4 py-3">DOB</th>
            <th className="px-4 py-3">Address</th>
            <th className="px-4 py-3">Member since</th>
            <th className="px-4 py-3">Last login</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={11} className="px-4 py-10 text-center text-black/50">
                Loading...
              </td>
            </tr>
          ) : null}
          {!loading
            ? people.map((p) => (
                <tr key={p.id} className="border-t border-black/5">
                  <td className="px-4 py-3 font-medium">{p.fullName}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.roleLabels ?? []).length ? (
                        p.roleLabels!.map((t) => (
                          <span
                            key={t}
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tagClass(t)}`}
                          >
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-black/40 text-xs">-</span>
                      )}
                      {typeof p.companyCount === 'number' && p.companyCount > 0 ? (
                        <span className="inline-flex items-center rounded-full border border-black/10 bg-white px-2 py-0.5 text-xs text-black/60">
                          {`${p.companyCount}家公司`}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.email ?? '-'}</td>
                  <td className="px-4 py-3">{p.phone ?? '-'}</td>
                  <td className="px-4 py-3">{p.idNo ?? '-'}</td>
                  <td className="px-4 py-3">{p.nationality ?? '-'}</td>
                  <td className="px-4 py-3">{p.dob ?? '-'}</td>
                  <td className="px-4 py-3 max-w-[420px]">
                    {p.address ? (
                      <div className="truncate" title={p.address}>
                        {p.address}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3">{p.memberSince ?? '-'}</td>
                  <td className="px-4 py-3">{p.lastLoginDate ?? '-'}</td>
                  <td className="px-4 py-3">{p.createdAt.slice(0, 10)}</td>
                </tr>
              ))
            : null}
          {!loading && people.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-4 py-10 text-center text-black/50">
                No results
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
