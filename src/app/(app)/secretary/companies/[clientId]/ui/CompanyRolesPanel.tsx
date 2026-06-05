'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import InlineCombobox from '@/app/(app)/secretary/companies/[clientId]/ui/InlineCombobox';

type RoleRow = {
  role: { id: string; role: string; shares?: number };
  entity:
    | { type: 'PERSON'; person: { id: string; fullName: string; email?: string; phone?: string; hasLogin: boolean } }
    | { type: 'COMPANY'; company: { id: string; code: string; name: string } };
};

type Props = {
  roles: {
    directors: RoleRow[];
    shareholders: RoleRow[];
    rorc: RoleRow[];
    secretaries: RoleRow[];
  };
  peopleOptions: Array<{ id: string; fullName: string; email?: string }>;
  companyOptions: Array<{ id: string; code: string; name: string }>;
  totalShares?: number;
  canEditRoles: boolean;
  creatingLoginForPersonId: string | null;
  onAddRole: (input: {
    role: 'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY';
    personId?: string;
    companyClientId?: string;
    shares?: number;
  }) => Promise<void>;
  onRemoveRole: (roleId: string) => Promise<void>;
  onCreateLogin: (personId: string) => Promise<void>;
  onUpdateShareholderShares: (roleId: string, shares: number) => Promise<void>;
};

export default function CompanyRolesPanel({
  roles,
  peopleOptions,
  companyOptions,
  totalShares,
  canEditRoles,
  creatingLoginForPersonId,
  onAddRole,
  onRemoveRole,
  onCreateLogin,
  onUpdateShareholderShares,
}: Props) {
  const [roleTab, setRoleTab] = useState<'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY'>('DIRECTOR');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [shareQty, setShareQty] = useState('');
  const [shareType, setShareType] = useState<'PERSON' | 'COMPANY'>('PERSON');

  const personCombo = useMemo(() => {
    return peopleOptions.map((p) => ({
      value: p.id,
      label: p.fullName,
      description: p.email ?? '',
      searchText: `${p.fullName} ${p.email ?? ''}`.toLowerCase(),
    }));
  }, [peopleOptions]);

  const companyCombo = useMemo(() => {
    return companyOptions.map((c) => ({
      value: c.id,
      label: c.name,
      description: c.code,
      searchText: `${c.name} ${c.code}`.toLowerCase(),
    }));
  }, [companyOptions]);

  const roleRows = roleTab === 'DIRECTOR' ? roles.directors : roleTab === 'SHAREHOLDER' ? roles.shareholders : roleTab === 'RORC' ? roles.rorc : roles.secretaries;
  const shareSum = useMemo(() => {
    if (roleTab !== 'SHAREHOLDER') return 0;
    return roleRows.reduce((sum, r) => sum + (typeof r.role.shares === 'number' && Number.isFinite(r.role.shares) ? r.role.shares : 0), 0);
  }, [roleRows, roleTab]);

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
          <div className="text-xs text-black/50">{roleTab === 'SHAREHOLDER' ? '添加股东（人员或公司）' : '添加人员到当前角色'}</div>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {roleTab === 'SHAREHOLDER' ? (
              <div className="flex items-center gap-2">
                <select
                  value={shareType}
                  onChange={(e) => setShareType(e.target.value === 'COMPANY' ? 'COMPANY' : 'PERSON')}
                  className="w-[120px] rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                >
                  <option value="PERSON">人员</option>
                  <option value="COMPANY">公司</option>
                </select>
                <input
                  value={shareQty}
                  onChange={(e) => setShareQty(e.target.value)}
                  inputMode="numeric"
                  placeholder="股份数"
                  className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </div>
            ) : null}
            {roleTab === 'SHAREHOLDER' && shareType === 'COMPANY' ? (
              <InlineCombobox
                label="公司"
                placeholder="请选择"
                value={selectedCompanyId || undefined}
                disabled={!canEditRoles}
                options={companyCombo}
                onChange={(v) => setSelectedCompanyId(v ?? '')}
              />
            ) : (
              <InlineCombobox
                label={roleTab === 'SHAREHOLDER' ? '人员' : undefined}
                placeholder="请选择"
                value={selectedPersonId || undefined}
                disabled={!canEditRoles}
                options={personCombo}
                onChange={(v) => setSelectedPersonId(v ?? '')}
              />
            )}
            <button
              onClick={async () => {
                if (roleTab === 'SHAREHOLDER') {
                  const shares = shareQty.trim() ? Number(shareQty) : NaN;
                  if (!Number.isFinite(shares) || shares < 0) return;
                  if (shareType === 'COMPANY') {
                    const cid = selectedCompanyId || '';
                    if (!cid) return;
                    await onAddRole({ role: 'SHAREHOLDER', companyClientId: cid, shares });
                    setSelectedCompanyId('');
                  } else {
                    const pid = selectedPersonId || '';
                    if (!pid) return;
                    await onAddRole({ role: 'SHAREHOLDER', personId: pid, shares });
                    setSelectedPersonId('');
                  }
                  setShareQty('');
                  return;
                }

                const personId = selectedPersonId || '';
                if (!personId) return;
                await onAddRole({ role: roleTab, personId });
                setSelectedPersonId('');
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

      {roleTab === 'SHAREHOLDER' && typeof totalShares === 'number' && Number.isFinite(totalShares) ? (
        <div className="mt-4 text-xs">
          <span className="text-black/50">股东股份合计：</span>
          <span className={shareSum === totalShares ? 'text-[#2a7f3a]' : 'text-red-600'}>{shareSum}</span>
          <span className="text-black/50"> / 总股数：</span>
          <span className="text-black/70">{totalShares}</span>
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-black/5 overflow-hidden">
        {roleRows.length === 0 ? (
          <div className="px-3 py-3 text-sm text-black/50">暂无</div>
        ) : (
          <div className="divide-y divide-black/5">
            {roleRows.map((r) => {
              const e = r.entity;
              return (
                <div key={r.role.id} className="px-3 py-3 flex items-start justify-between gap-3">
                  <div>
                    {e.type === 'PERSON' ? (
                      <>
                        <div className="text-sm font-medium">{e.person.fullName}</div>
                        <div className="mt-0.5 text-xs text-black/50">
                          {e.person.email ?? '-'}{e.person.phone ? ` · ${e.person.phone}` : ''}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={[
                              'text-xs px-2 py-0.5 rounded-full border',
                              e.person.hasLogin ? 'border-[#46b35a] text-[#2a7f3a]' : 'border-black/10 text-black/50',
                            ].join(' ')}
                          >
                            {e.person.hasLogin ? '可登录' : '未开通登录'}
                          </span>
                          {canEditRoles && !e.person.hasLogin && e.person.email ? (
                            <button
                              onClick={() => onCreateLogin(e.person.id)}
                              disabled={creatingLoginForPersonId === e.person.id}
                              className="text-xs text-[#2f7bdc] hover:underline disabled:opacity-60"
                            >
                              {creatingLoginForPersonId === e.person.id ? 'Creating...' : '开通登录'}
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-medium">{e.company.name}</div>
                        <div className="mt-0.5 text-xs text-black/50">{`Company · ${e.company.code}`}</div>
                      </>
                    )}

                    {roleTab === 'SHAREHOLDER' ? (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="text-xs text-black/50">股份</div>
                        {canEditRoles ? (
                          <input
                            defaultValue={typeof r.role.shares === 'number' ? String(r.role.shares) : ''}
                            inputMode="numeric"
                            className="w-[120px] rounded-md border border-black/10 px-2 py-1 text-xs"
                            onBlur={async (ev) => {
                              const v = ev.target.value.trim();
                              const n = v ? Number(v) : NaN;
                              if (!Number.isFinite(n) || n < 0) return;
                              if (n === r.role.shares) return;
                              await onUpdateShareholderShares(r.role.id, n);
                            }}
                          />
                        ) : (
                          <div className="text-xs text-black/70">{typeof r.role.shares === 'number' ? r.role.shares : '-'}</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {canEditRoles ? (
                    <button onClick={() => onRemoveRole(r.role.id)} className="text-xs text-red-600 hover:underline">
                      移除
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
