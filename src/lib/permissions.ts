import type { PermissionAction, PermissionModule, Permissions, Role } from '@/lib/types';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions?: Permissions;
};

export function hasPermission(user: CurrentUser, module: PermissionModule, action: PermissionAction) {
  if (user.role === 'owner') return true;
  const permissions: Permissions =
    user.permissions ??
    (user.role === 'manager'
      ? {
          jobs: { viewAssigned: true, viewAll: true, create: true, update: true, complete: true, duplicate: true },
          tasks: { viewAssigned: true, viewAll: true, create: true, update: true, complete: true },
          clients: { viewAssigned: true, viewAll: true, create: true, update: true },
          staffs: { viewAssigned: true, viewAll: true, create: true, update: true },
        }
      : {
          jobs: { viewAssigned: true },
          tasks: { viewAssigned: true, complete: true },
          clients: { viewAssigned: true },
          staffs: {},
        });
  return !!permissions?.[module]?.[action];
}

export function canManageTeam(user: CurrentUser) {
  return (
    hasPermission(user, 'staffs', 'viewAll') ||
    hasPermission(user, 'staffs', 'create') ||
    hasPermission(user, 'staffs', 'update')
  );
}
