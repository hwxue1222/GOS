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
  createdAt: string;
};

type Props = {
  people: Person[];
  loading: boolean;
};

export default function PeopleTable({ people, loading }: Props) {
  return (
    <div className="mt-6 rounded-xl bg-white border border-black/5 overflow-x-auto">
      <table className="min-w-[1450px] w-full text-sm">
        <thead className="bg-black/2">
          <tr className="text-left text-black/60">
            <th className="px-4 py-3">Name</th>
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
              <td colSpan={10} className="px-4 py-10 text-center text-black/50">
                Loading...
              </td>
            </tr>
          ) : null}
          {!loading
            ? people.map((p) => (
                <tr key={p.id} className="border-t border-black/5">
                  <td className="px-4 py-3 font-medium">{p.fullName}</td>
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
              <td colSpan={10} className="px-4 py-10 text-center text-black/50">
                No results
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
