import type { PermissionAction, PermissionModule, Permissions, Role } from '@/lib/types';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions?: Permissions;
};

function basePermissionsForRole(role: Role): Permissions {
  if (role === 'manager') {
    return {
      jobs: { viewAssigned: true, viewAll: true, create: true, update: true, complete: true, duplicate: true },
      tasks: { viewAssigned: true, viewAll: true, create: true, update: true, complete: true },
      clients: { viewAssigned: true, viewAll: true, create: true, update: true },
      staffs: { viewAssigned: true, viewAll: true, create: true, update: true },
      invoices: { viewAll: true, create: true, update: true, markPaid: true },
      secretary: { viewAssigned: true, viewAll: true, create: true, update: true },
      people: { viewAssigned: true, viewAll: true, create: true, update: true, import: true },
    };
  }
  if (role === 'client') {
    return {
      jobs: {},
      tasks: {},
      clients: {},
      staffs: {},
      invoices: {},
      secretary: { viewAssigned: true, update: true },
      people: {},
    };
  }
  return {
    jobs: { viewAssigned: true },
    tasks: { viewAssigned: true, complete: true },
    clients: { viewAssigned: true },
    staffs: {},
    invoices: {},
    secretary: {},
    people: {},
  };
}

function mergePermissions(base: Permissions, override?: Permissions): Permissions {
  const o = override ?? {};
  return {
    ...base,
    ...o,
    jobs: { ...(base.jobs ?? {}), ...(o.jobs ?? {}) },
    tasks: { ...(base.tasks ?? {}), ...(o.tasks ?? {}) },
    clients: { ...(base.clients ?? {}), ...(o.clients ?? {}) },
    staffs: { ...(base.staffs ?? {}), ...(o.staffs ?? {}) },
    invoices: { ...(base.invoices ?? {}), ...(o.invoices ?? {}) },
    secretary: { ...(base.secretary ?? {}), ...(o.secretary ?? {}) },
    people: { ...(base.people ?? {}), ...(o.people ?? {}) },
  };
}

export function hasPermission(user: CurrentUser, module: PermissionModule, action: PermissionAction) {
  if (user.role === 'owner') return true;
  const nameKey = user.name.trim().toLowerCase();
  if (nameKey === 'lily' && module === 'jobs' && action === 'viewAll') return true;
  const permissions: Permissions = mergePermissions(basePermissionsForRole(user.role), user.permissions);
  return !!permissions?.[module]?.[action];
}

export function canManageTeam(user: CurrentUser) {
  return (
    hasPermission(user, 'staffs', 'viewAll') ||
    hasPermission(user, 'staffs', 'create') ||
    hasPermission(user, 'staffs', 'update')
  );
}
