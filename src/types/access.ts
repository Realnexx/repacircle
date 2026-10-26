export type WorkspaceRole = 'platform-admin' | 'organizer' | 'treasurer' | 'member'
export type AccessState = { roles: WorkspaceRole[]; organizationId: string | null }
export function hasWorkspaceAccess(roles: WorkspaceRole[], required: WorkspaceRole) {
  return roles.includes(required)
}
