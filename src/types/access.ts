export type WorkspaceRole = 'platform-admin' | 'organizer' | 'treasurer' | 'member'
export type AccessState = { roles: WorkspaceRole[]; organizationId: string | null }
export function hasWorkspaceAccess(roles: WorkspaceRole[], required: WorkspaceRole) {
  return roles.includes(required)
}
export function routePermission(role: WorkspaceRole, path: string) {
  const slug = path.split('/').at(-1)
  if (role === 'platform-admin')
    return slug === 'settings'
      ? 'platform.settings.manage'
      : slug === 'support'
        ? 'platform.support.resolve'
        : slug === 'dashboard'
          ? 'platform.analytics.read'
          : 'platform.accounts.manage'
  if (role === 'organizer')
    return slug === 'settings'
      ? 'organization.update'
      : slug === 'members'
        ? 'organization.members.read'
        : slug === 'contributions'
          ? 'group.rules.manage'
          : slug === 'payments'
            ? 'payments.verify'
            : slug === 'payouts'
              ? 'payouts.manage'
              : slug === 'reports'
                ? 'reports.organization.read'
                : 'groups.manage'
  if (role === 'treasurer')
    return slug === 'collections'
      ? 'payments.cash.record'
      : slug === 'verification'
        ? 'payments.review'
        : slug === 'reconciliation'
          ? 'collections.reconcile'
          : 'treasurer.workspace'
  return 'personal.read'
}
