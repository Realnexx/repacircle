import { command, requireClient } from '@/lib/api/client'
import { draftSchema, type GroupConfig, type GroupStatus } from './config'
import { validateImage, privateImageUrl } from '@/lib/supabase/media'
import type { FundingResult } from './calculations'
export type RepaGroup = {
  id: string
  organization_id: string
  name: string
  description: string
  image_path: string
  visibility: string
  currency: string
  mechanism: GroupConfig['mechanism']
  start_date: string
  status: GroupStatus
  revision: number
  latest_version_id: string
  accepted_version_id: string | null
  created_at: string
}
export type RuleVersion = {
  id: string
  version_number: number
  approval_status: 'pending' | 'approved' | 'rejected'
  change_summary: string
  changes: { path: string; previous: unknown; next: unknown }[]
  changed_by: string
  approved_by: string | null
  member_consent_count?: number
  effective_date: string
  created_at: string
}
export type ActivationReport = Partial<FundingResult> & {
  valid: boolean
  errors: string[]
  assigned_members: number
  member_consents: number
  eligible_approvers: number
}
export type RepaBundle = {
  group: RepaGroup
  configuration: GroupConfig
  accepted_configuration: GroupConfig | null
  versions: RuleVersion[]
  checks: { id: string; result: ActivationReport; checked_at: string }[]
  members: {
    user_id: string
    name: string
    role: string
    slot: number | null
    consented: boolean
  }[]
  my_consent: { custom_values: Record<string, unknown>; accepted_at: string } | null
  can_manage: boolean
}
export async function listRepaGroups(organizationId: string) {
  const { data, error } = await requireClient()
    .from('repa_groups')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as RepaGroup[]
}
export async function getRepaGroup(id: string) {
  return command<RepaBundle>('get_repa_group', { target: id })
}
export async function saveRepaDraft(
  c: GroupConfig,
  id: string | null,
  revision: number,
  summary: string,
  effectiveDate: string,
) {
  return command<string>('save_repa_draft', {
    target_organization: c.basic.organization_id,
    group_id: id,
    expected_revision: revision,
    configuration: draftSchema.parse(c),
    change_summary: summary,
    effective_date: effectiveDate,
  })
}
export const checkActivation = (id: string, version: string) =>
  command<ActivationReport>('check_repa_activation', { target: id, version_id: version })
export const activateGroup = (id: string, version: string, accepted: boolean) =>
  command('activate_repa_group', { target: id, target_version: version, accepted_terms: accepted })
export const approveProposal = (id: string, version: string) =>
  command('approve_repa_proposal', { target: id, target_version: version })
export const consentRules = (version: string, values: Record<string, unknown>) =>
  command('consent_repa_rules', { target_version: version, custom_values: values })
export const transitionGroup = (
  id: string,
  status: GroupStatus,
  next: GroupStatus,
  reason: string,
) =>
  command('transition_repa_group', {
    target: id,
    expected_status: status,
    new_status: next,
    reason,
  })
export async function uploadRepaFile(groupId: string, file: File, image = false) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Choose a file of 2 MB or less.')
  let ext: string
  if (image || file.type.startsWith('image/')) {
    await validateImage(file)
    ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png'
  } else if (file.type === 'application/pdf') {
    const head = await file.slice(0, 5).text()
    if (head !== '%PDF-') throw new Error('Invalid PDF file.')
    ext = 'pdf'
  } else if (file.type === 'text/plain') ext = 'txt'
  else throw new Error('Choose PNG, JPEG, WebP, PDF or plain text.')
  const { data: identity, error: identityError } = await requireClient().auth.getUser()
  if (identityError || !identity.user) throw new Error('Sign in before uploading files.')
  const path = `${groupId}/${identity.user.id}/${crypto.randomUUID()}.${ext}`
  const { error } = await requireClient()
    .storage.from('repa-uploads')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  return path
}
export const repaFileUrl = (path: string) => privateImageUrl('repa-uploads', path)
export const moneyText = (value: number, currency = 'PHP') =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(value / 100)
