import { command, requireClient } from '@/lib/api/client'
import { validateImage, privateImageUrl } from '@/lib/supabase/media'
import {
  rewardInputSchema,
  type RewardInput,
  type PriceSummary,
  type PlanCosts,
  type DistributionLine,
  type RewardComponent,
} from './config'
export type RewardCategory = {
  id: string
  organization_id: string | null
  name: string
  description: string
  active: boolean
  revision: number
}
export type RewardTemplate = {
  id: string
  organization_id: string | null
  name: string
  description: string
  category_id: string
  kind: RewardInput['kind']
  defaults: RewardInput
}
export type CatalogItem = {
  components?: RewardComponent[]
  id: string
  name: string
  kind: RewardInput['kind']
  category_id: string | null
  category_name: string
  currency: string
  status: 'draft' | 'published' | 'archived'
  revision: number
  current_version_id: string
  pricing: PriceSummary
  configuration: RewardInput
}
export type Catalog = {
  categories: RewardCategory[]
  templates: RewardTemplate[]
  items: CatalogItem[]
}
export type RewardBundle = {
  item: {
    id: string
    organization_id: string
    name: string
    status: string
    revision: number
    current_version_id: string
  }
  version_id: string
  configuration: RewardInput
  pricing: PriceSummary
  category_name: string
  can_manage: boolean
  versions: {
    id: string
    version_number: number
    published: boolean
    created_at: string
    created_by: string
  }[]
  components: {
    version_id: string
    item_id: string
    name: string
    kind: RewardInput['kind']
    configuration: RewardInput
    quantity: number
    pricing: PriceSummary
  }[]
}
export const getCatalog = (org: string) =>
  command<Catalog>('get_reward_catalog', { target_organization: org })
export const getReward = (id: string, version?: string) =>
  command<RewardBundle>('get_reward_item', { target: id, version_id: version ?? null })
export const getPlan = (id: string) => command<PlanCosts>('get_reward_plan', { target: id })
export const saveReward = (
  org: string,
  id: string | null,
  revision: number,
  input: RewardInput,
  publish: boolean,
) =>
  command<string>('save_reward_item', {
    target_organization: org,
    item_id: id,
    expected_revision: revision,
    configuration: rewardInputSchema.parse(input),
    publish,
  })
export const archiveReward = (id: string, revision: number) =>
  command('archive_reward_item', { target: id, expected_revision: revision })
export const createTemplate = (id: string, name: string, description: string) =>
  command<string>('create_reward_template', {
    target_item: id,
    template_name: name,
    template_description: description,
  })
export const saveCategory = (
  org: string,
  category: RewardCategory | null,
  name: string,
  description: string,
  active: boolean,
) =>
  command<string>('save_reward_category', {
    target_organization: org,
    category_id: category?.id ?? null,
    expected_revision: category?.revision ?? 0,
    new_name: name,
    new_description: description,
    is_active: active,
  })
export const saveGroupPlan = (
  id: string,
  revision: number,
  name: string,
  lines: DistributionLine[],
  summary: string,
  effective: string,
) =>
  command<string>('save_group_reward_plan', {
    target: id,
    expected_revision: revision,
    plan_name: name,
    lines: lines.map((l) => ({
      version_id: l.version_id,
      scope: l.scope,
      round_number: l.round_number,
      quantity: l.quantity,
    })),
    change_summary: summary,
    effective_date: effective,
  })
export async function uploadRewardFile(org: string, file: File, image = false) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Choose a file of 2 MB or less.')
  let ext: string
  if (image || file.type.startsWith('image/')) {
    await validateImage(file)
    ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png'
  } else if (file.type === 'application/pdf') {
    if ((await file.slice(0, 5).text()) !== '%PDF-') throw new Error('Invalid PDF file.')
    ext = 'pdf'
  } else if (file.type === 'text/plain') ext = 'txt'
  else throw new Error('Choose PNG, JPEG, WebP, PDF or plain text.')
  const { data, error: authError } = await requireClient().auth.getUser()
  if (authError || !data.user) throw new Error('Sign in before uploading reward files.')
  const path = `${org}/${data.user.id}/${crypto.randomUUID()}.${ext}`
  const { error } = await requireClient()
    .storage.from('reward-media')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  return path
}
export const rewardFileUrl = (path: string) => privateImageUrl('reward-media', path)
