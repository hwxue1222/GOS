'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PermissionAction, PermissionModule, Permissions, Role } from '@/lib/types';

type StaffRow = {
  id: string;
  name: string;
  email: string;
  position?: string;
  role: Role;
  permissions?: Permissions;
  tasksOverdue: number;
};

type Props = { initialUsers: StaffRow[] };

type FormState = {
  name: string;
  email: string;
  position: string;
  role: Role;
  permissions: Permissions;
};

const PERMISSION_TABLE: Array<{
  module: PermissionModule;
  label: string;
  actions: PermissionAction[];
}> = [
  {
    module: 'jobs',
    label: 'Jobs',
    actions: ['viewAssigned', 'viewAll', 'create', 'update', 'trash', 'complete', 'duplicate'],
  },
  {
    module: 'tasks',
    label: 'Tasks',
    actions: ['viewAssigned', 'viewAll', 'create', 'update', 'trash', 'complete'],
  },
  {
    module: 'clients',
    label: 'Clients',
    actions: ['viewAssigned', 'viewAll', 'create', 'update', 'trash'],
  },
  {
    module: 'staffs',
    label: 'Staffs',
    actions: ['viewAssigned', 'viewAll', 'create', 'update', 'trash'],
  },
];

function defaultPermissionsForRole(role: Role): Permissions {
  if (role === 'owner') {
    return {
      jobs: { viewAssigned: true, viewAll: true, create: true, update: true, complete: true, duplicate: true, trash: true },
      tasks: { viewAssigned: true, viewAll: true, create: true, update: true, complete: true, trash: true },
      clients: { viewAssigned: true, viewAll: true, create: true, update: true, trash: true },
      staffs: { viewAssigned: true, viewAll: true, create: true, update: true, trash: true },
    };
  }
  if (role === 'manager') {
    return {
      jobs: { viewAssigned: true, viewAll: true, create: true, update: true, complete: true, duplicate: true },
      tasks: { viewAssigned: true, viewAll: true, create: true, update: true, complete: true },
      clients: { viewAssigned: true, viewAll: true, create: true, update: true },
      staffs: { viewAssigned: true, viewAll: true, create: true, update: true },
    };
  }
  return {
    jobs: { viewAssigned: true },
    tasks: { viewAssigned: true, complete: true },
    clients: { viewAssigned: true },
    staffs: {},
  };
}

function getPermission(permissions: Permissions, module: PermissionModule, action: PermissionAction) {
  return !!permissions?.[module]?.[action];
}

function setPermission(
  permissions: Permissions,
  module: PermissionModule,
  action: PermissionAction,
  value: boolean,
): Permissions {
  return {
    ...permissions,
    [module]: {
      ...(permissions?.[module] ?? {}),
      [action]: value,
    },
  };
}

function staffToForm(u: StaffRow): FormState {
  return {
    name: u.name,
    email: u.email,
    position: u.position ?? '',
    role: u.role,
    permissions: u.permissions ?? defaultPermissionsForRole(u.role),
  };
}

export default function TeamClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<StaffRow[]>(initialUsers);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'edit' | 'create'>(users.length ? 'edit' : 'create');
  const [selectedId, setSelectedId] = useState<string>(users[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => users.find((u) => u.id === selectedId) ?? null, [selectedId, users]);
  const [form, setForm] = useState<FormState>(() => {
    if (users.length) return staffToForm(users[0]!);
    return {
      name: '',
      email: '',
      position: '',
      role: 'staff',
      permissions: defaultPermissionsForRole('staff'),
    };
  });

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.name} ${u.email} ${u.position ?? ''}`.toLowerCase().includes(q));
  }, [search, users]);

  const actionColumns = useMemo(
    () => ['viewAssigned', 'viewAll', 'create', 'update', 'trash', 'complete', 'duplicate'] as PermissionAction[],
    [],
  );

  const actionLabel = useMemo(() => {
    return {
      viewAssigned: 'view',
      viewAll: 'view all',
      create: 'create',
      update: 'update',
      trash: 'delete',
      complete: 'complete',
      duplicate: 'duplicate',
    } as Partial<Record<PermissionAction, string>>;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/team/staffs')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.users)) setUsers(j.users as StaffRow[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function startCreate() {
    setMode('create');
    setError(null);
    setForm({
      name: '',
      email: '',
      position: '',
      role: 'staff',
      permissions: defaultPermissionsForRole('staff'),
    });
  }

  function startEdit(userId: string) {
    const u = users.find((x) => x.id === userId);
    if (!u) return;
    setMode('edit');
    setError(null);
    setSelectedId(u.id);
    setForm(staffToForm(u));
  }

  function cancel() {
    setError(null);
    if (mode === 'create') {
      if (users.length) startEdit(users[0]!.id);
      return;
    }
    if (selected) setForm(staffToForm(selected));
  }

  async function save() {
    setError(null);
    if (!form.name.trim() || !form.email.trim()) {
      setError('INVALID_INPUT');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            position: form.position || undefined,
            role: form.role,
            permissions: form.permissions,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setError(j?.error ?? 'CREATE_FAILED');
          return;
        }
        const j = (await res.json().catch(() => null)) as { ok?: boolean; user?: StaffRow } | null;
        if (j?.user) {
          const created: StaffRow = { ...j.user, tasksOverdue: 0 };
          setUsers((prev) => [created, ...prev]);
          startEdit(created.id);
        }
      } else {
        if (!selectedId) return;
        const res = await fetch(`/api/users/${selectedId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            position: form.position || undefined,
            role: form.role,
            permissions: form.permissions,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setError(j?.error ?? 'UPDATE_FAILED');
          return;
        }
        const j = (await res.json().catch(() => null)) as { ok?: boolean; user?: Partial<StaffRow> } | null;
        if (j?.user?.id) {
          setUsers((prev) =>
            prev.map((u) => (u.id === j.user!.id ? ({ ...u, ...(j.user as StaffRow) } as StaffRow) : u)),
          );
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Team</h1>
          <button
            onClick={startCreate}
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium"
          >
            + Add Staff
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="font-medium">{mode === 'create' ? 'Add Staff' : 'Update Staff'}</div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={cancel} className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={save}
                className="rounded-md bg-[#46b35a] text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                {saving ? 'Saving...' : mode === 'create' ? 'Create Staff' : 'Update Staff'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
              placeholder="Staff name (login account)"
            />
            <input
              value={form.email}
              onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
              placeholder="Email"
            />
            <input
              value={form.position}
              onChange={(e) => setForm((v) => ({ ...v, position: e.target.value }))}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
              placeholder="Position"
            />
            {mode === 'create' ? (
              <div className="text-sm text-black/60 flex items-center">
                Login account: staff name · Initial password: 123456
              </div>
            ) : (
              <div />
            )}
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium">Roles</div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {(['owner', 'manager', 'staff'] as const).map((r) => (
                <label key={r} className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="role"
                    checked={form.role === r}
                    onChange={() =>
                      setForm((v) => ({
                        ...v,
                        role: r,
                        permissions: v.permissions && Object.keys(v.permissions).length ? v.permissions : defaultPermissionsForRole(r),
                      }))
                    }
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium">Permissions</div>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-[900px] text-sm">
                <thead className="text-left text-black/60">
                  <tr className="border-b border-black/5">
                    <th className="py-2 pr-4 font-medium">Module</th>
                    {actionColumns.map((a) => (
                      <th key={a} className="py-2 pr-4 font-medium whitespace-nowrap">
                        {actionLabel[a] ?? a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_TABLE.map((row) => (
                    <tr key={row.module} className="border-b border-black/5">
                      <td className="py-2 pr-4 whitespace-nowrap">{row.label}</td>
                      {actionColumns.map((a) => (
                        <td key={a} className="py-2 pr-4">
                          {row.actions.includes(a) ? (
                            <input
                              type="checkbox"
                              checked={getPermission(form.permissions, row.module, a)}
                              onChange={(e) =>
                                setForm((v) => ({
                                  ...v,
                                  permissions: setPermission(v.permissions, row.module, a, e.target.checked),
                                }))
                              }
                            />
                          ) : (
                            <span className="text-black/30">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 max-w-[60vw] rounded-md border border-black/10 px-3 py-2 text-sm bg-white"
            placeholder="Find Staff..."
          />
          <button className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium">Find</button>
        </div>

        <div className="mt-3 rounded-xl bg-white border border-black/5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60">
              <tr className="border-b border-black/5">
                <th className="px-4 py-3 font-medium">Staff name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Tasks overdue</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  className={[
                    'border-b border-black/5 hover:bg-black/[0.02] cursor-pointer',
                    u.id === selectedId && mode === 'edit' ? 'bg-black/[0.02]' : '',
                  ].join(' ')}
                  onClick={() => startEdit(u.id)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-[#2f7bdc]">
                    <span title={u.name}>{u.name}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{u.position ?? '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{u.role}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {u.tasksOverdue > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded bg-red-600 text-white text-xs">
                        {u.tasksOverdue}
                      </span>
                    ) : (
                      <span className="text-black/40">0</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-black/50">
                    No staff
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
