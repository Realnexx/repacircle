import { z } from 'zod'
import { requireClient, command } from '@/lib/api/client'
export const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters.')
    .max(80, 'Use 80 characters or fewer.'),
})
export const organizationDetailsSchema = organizationSchema.extend({
  description: z.string().trim().max(2000),
})
export type Organization = {
  id: string
  name: string
  description: string
  logo_path: string | null
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}
export type DirectoryMember = {
  user_id: string
  full_name: string
  email: string | null
  role: 'owner' | 'organizer' | 'treasurer' | 'member'
  mfa_enrolled: boolean
}
export type Invitation = {
  id: string
  organization_id: string
  email: string
  role: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}
export type CreatedInvitation = { id: string; token: string; email: string; role: string }
export type GroupScope = { id: string; name: string; organization_id: string }
export type GroupAssignment = {
  id: string
  group_id: string
  user_id: string
  role: 'treasurer' | 'member'
}
export async function listOrganizations(): Promise<Organization[]> {
  const { data, error } = await requireClient()
    .from('organizations')
    .select('id,name,description,logo_path,status,created_at,updated_at')
    .order('created_at')
  if (error) throw error
  return data
}
export async function createOrganization(
  input: { name: string; description?: string },
  requestId: string,
) {
  const values = organizationDetailsSchema.parse({ description: '', ...input })
  return command<string>('create_organization_with_details', {
    organization_name: values.name,
    organization_description: values.description,
    request_id: requestId,
  })
}
export async function updateOrganization(
  org: Organization,
  values: z.infer<typeof organizationDetailsSchema>,
  logoPath: string | null,
) {
  const parsed = organizationDetailsSchema.parse(values)
  return command('update_organization', {
    target: org.id,
    new_name: parsed.name,
    new_description: parsed.description,
    new_logo_path: logoPath,
  })
}
export const directory = (id: string) =>
  command<DirectoryMember[]>('organization_directory', { target: id })
export async function listInvitations(id: string) {
  const { data, error } = await requireClient()
    .from('organization_invitations')
    .select('id,organization_id,email,role,expires_at,accepted_at,revoked_at,created_at')
    .eq('organization_id', id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Invitation[]
}
export const createInvitation = (id: string, email: string, role: string) =>
  command<CreatedInvitation>('create_organization_invitation', {
    target: id,
    invite_email: email,
    invite_role: role,
  })
export const revokeInvitation = (id: string) =>
  command('revoke_organization_invitation', { invitation_id: id })
export async function sendInvitationEmail(invitation: CreatedInvitation) {
  const { data, error } = await requireClient().functions.invoke('send-organization-invitation', {
    body: { invitation_id: invitation.id, invitation_token: invitation.token },
  })
  if (error)
    throw new Error(
      'Email delivery failed or is not configured. The invitation remains valid; copy its secure link or retry delivery.',
    )
  return data
}
export function invitationStatus(invitation: Invitation, now = Date.now()) {
  return invitation.revoked_at
    ? 'Revoked'
    : invitation.accepted_at
      ? 'Accepted'
      : Date.parse(invitation.expires_at) <= now
        ? 'Expired'
        : 'Pending'
}
export async function listGroupScopes(id: string) {
  const { data, error } = await requireClient()
    .from('group_scopes')
    .select('id,name,organization_id')
    .eq('organization_id', id)
    .order('created_at')
  if (error) throw error
  return data as GroupScope[]
}
export async function listGroupAssignments(id: string) {
  const { data, error } = await requireClient()
    .from('group_role_assignments')
    .select('id,group_id,user_id,role')
    .eq('organization_id', id)
  if (error) throw error
  return data as GroupAssignment[]
}
