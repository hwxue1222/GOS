'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type RoleRow = {
  role: { id: string; role: string };
  person: { id: string; fullName: string; email?: string; phone?: string; hasLogin: boolean };
};

type Props = {
  roles: {
    directors: RoleRow[];
    shareholders: RoleRow[];
    rorc: RoleRow[];
    secretaries: RoleRow[];
  };
  peopleOptions: Array<{ id: string; fullName: string; email?: string }>;
  canEditRoles: boolean;
  creatingLoginForPersonId: string | null;
  onAddRole: (personId: string, role: 'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY') => Promise<void>;
  onRemoveRole: (roleId: string) => Promise<void>;
  onCreateLogin: (personId: string) => Promise<void>;
};

export default function CompanyRolesPanel({
  roles,
  peopleOptions,
  canEditRoles,
  creatingLoginForPersonId,
  onAddRole,
  onRemoveRole,
  onCreateLogin,
}: Props) {
  const [roleTab, setRoleTab] = useState<'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY'>('DIRECTOR');
  const [personQuery, setPersonQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');

  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    if (!q) return peopleOptions.slice(0, 30);
    return peopleOptions
      .filter((p) => `${p.fullName} ${p.email ?? ''}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [peopleOptions, personQuery]);

  const roleRows = roleTab === 'DIRECTOR' ? roles.directors : roleTab === 'SHAREHOLDER' ? roles.shareholders : roleTab === 'RORC' ? roles.rorc : roles.secretaries;

  return (
    <div className="rounded-xl bg-white border border-black/5 p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">人员与角色</div>
        <Link href="/secretary/people" className="text-sm text-[#2f7bdc] hover:underline">
          人员库
        </Link>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {(['DIRECTOR', 'SHAREHOLDER', 'RORC', 'SECRETARY'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setRoleTab(t)}
            className={[
              'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
              roleTab === t ? 'bg-[#23323d] text-white border-[#23323d]' : 'bg-white text-black/70 border-black/10 hover:bg-black/2',
            ].join(' ')}
          >
            {t === 'DIRECTOR' ? '董事' : t === 'SHAREHOLDER' ? '股东' : t === 'RORC' ? 'RORC' : '秘书'}
          </button>
        ))}
      </div>

      {canEditRoles ? (
        <div className="mt-4">
          <div className="text-xs text-black/50">添加人员到当前角色</div>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <input
              value={personQuery}
              onChange={(e) => setPersonQuery(e.target.value)}
              placeholder="搜索姓名/邮箱"
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <select
              value={selectedPersonId}
              onChange={(e) => setSelectedPersonId(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
            >
              <option value="">请选择</option>
              {filteredPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}{p.email ? ` (${p.email})` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                const personId = selectedPersonId || '';
                if (!personId) return;
                await onAddRole(personId, roleTab);
                setSelectedPersonId('');
                setPersonQuery('');
              }}
              className="rounded-md bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium"
            >
              添加
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 text-xs text-black/50">只读：你可以查看角色信息。</div>
      )}

      <div className="mt-4 rounded-lg border border-black/5 overflow-hidden">
        {roleRows.length === 0 ? (
          <div className="px-3 py-3 text-sm text-black/50">暂无</div>
        ) : (
          <div className="divide-y divide-black/5">
            {roleRows.map((r) => (
              <div key={r.role.id} className="px-3 py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{r.person.fullName}</div>
                  <div className="mt-0.5 text-xs text-black/50">
                    {r.person.email ?? '-'}{r.person.phone ? ` · ${r.person.phone}` : ''}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={[
                        'text-xs px-2 py-0.5 rounded-full border',
                        r.person.hasLogin ? 'border-[#46b35a] text-[#2a7f3a]' : 'border-black/10 text-black/50',
                      ].join(' ')}
                    >
                      {r.person.hasLogin ? '可登录' : '未开通登录'}
                    </span>
                    {canEditRoles && !r.person.hasLogin && r.person.email ? (
                      <button
                        onClick={() => onCreateLogin(r.person.id)}
                        disabled={creatingLoginForPersonId === r.person.id}
                        className="text-xs text-[#2f7bdc] hover:underline disabled:opacity-60"
                      >
                        {creatingLoginForPersonId === r.person.id ? 'Creating...' : '开通登录'}
                      </button>
                    ) : null}
                  </div>
                </div>
                {canEditRoles ? (
                  <button onClick={() => onRemoveRole(r.role.id)} className="text-xs text-red-600 hover:underline">
                    移除
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

