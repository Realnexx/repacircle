import type { Page } from '@playwright/test'
import { mockRepa } from './repa'
import { organizationA } from './supabase'
import {
  defaultReward,
  rewardInputSchema,
  publishErrors,
  rewardPricing,
  type RewardInput,
  type PlanCosts,
} from '../../src/modules/rewards/config'
import { previewPlan } from '../../src/modules/rewards/pricing'
import type { Catalog, CatalogItem, RewardBundle } from '../../src/modules/rewards/service'
const id = (n: number) => `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export async function mockRewards(page: Page) {
  const base = await mockRepa(page)
  let sequence = 20
  const categories: Catalog['categories'] = [
    {
      id: id(1),
      organization_id: null,
      name: 'Appliances',
      description: '',
      active: true,
      revision: 1,
    },
    {
      id: id(2),
      organization_id: organizationA,
      name: 'Community experiences',
      description: 'From the database',
      active: true,
      revision: 1,
    },
  ]
  const templates: Catalog['templates'] = [
    {
      id: id(3),
      organization_id: null,
      name: 'Refrigerator',
      description: '',
      category_id: id(1),
      kind: 'physical_product',
      defaults: {
        ...defaultReward(),
        name: 'Refrigerator',
        category_id: id(1),
        attributes: [
          {
            definition: {
              key: 'custom_capacity',
              label: 'Capacity (liters)',
              type: 'number',
              required: true,
              category: 'reward',
              min: 1,
            },
            applies_to: ['physical_product'],
          },
        ],
      },
    },
  ]
  const versions = new Map<string, RewardBundle>()
  const items = new Map<string, CatalogItem>()
  const plans = new Map<string, PlanCosts>()
  function put(configuration: RewardInput, publish = true, itemId = id(++sequence)) {
    const old = items.get(itemId)
    const revision = (old?.revision ?? 0) + 1
    const vid = id(++sequence)
    const pricing = rewardPricing(
      configuration,
      new Map([...versions].map(([id, b]) => [id, b.pricing])),
    )
    const item: CatalogItem = {
      id: itemId,
      name: configuration.name,
      kind: configuration.kind,
      category_id: configuration.category_id,
      category_name: categories.find((c) => c.id === configuration.category_id)?.name ?? '',
      currency: configuration.currency,
      status: publish ? 'published' : 'draft',
      revision,
      current_version_id: vid,
      configuration,
      pricing,
    }
    const bundle: RewardBundle = {
      item: {
        id: itemId,
        organization_id: organizationA,
        name: item.name,
        status: item.status,
        revision,
        current_version_id: vid,
      },
      version_id: vid,
      category_name: item.category_name,
      configuration,
      pricing,
      can_manage: true,
      versions: [
        {
          id: vid,
          version_number: revision,
          published: publish,
          created_at: new Date().toISOString(),
          created_by: 'Organizer',
        },
        ...(old ? versions.get(old.current_version_id)!.versions : []),
      ],
      components: configuration.components.map((c) => {
        const b = versions.get(c.version_id)!
        return {
          ...c,
          item_id: b.item.id,
          name: b.configuration.name,
          kind: b.configuration.kind,
          pricing: b.pricing,
          configuration: b.configuration,
        }
      }),
    }
    item.components = bundle.components
    items.set(itemId, item)
    versions.set(vid, bundle)
    return item
  }
  put({
    ...defaultReward(),
    name: 'Cash reserve',
    kind: 'cash',
    category_id: id(2),
    estimated_unit_minor: 10000,
    cash_transfer_method: 'Verified bank transfer',
  })
  put({
    ...defaultReward(),
    name: 'Laptop bundle',
    kind: 'physical_product',
    category_id: id(1),
    estimated_unit_minor: 15000,
    shipping_fee_minor: 1000,
    delivery_method: 'Supplier delivery',
  })
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/*reward*', async (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').at(-1)!
    const b = route.request().postDataJSON()
    base.fixture.state.calls.push({ path: '/rest/v1/rpc/' + rpc, body: b, query: '' })
    const respond = (json: unknown, status = 200) =>
      route.fulfill({ status, json, headers: { 'Access-Control-Allow-Origin': '*' } })
    if (rpc === 'get_reward_catalog')
      return respond({ categories, templates, items: [...items.values()] })
    if (rpc === 'get_reward_item') {
      const i = items.get(b.target)
      const bundle = versions.get(b.version_id ?? i?.current_version_id)
      if (!bundle) return respond({ message: 'Reward unavailable' }, 404)
      return respond({
        ...bundle,
        item: i
          ? {
              ...bundle.item,
              status: i.status,
              revision: i.revision,
              current_version_id: i.current_version_id,
            }
          : bundle.item,
        versions: i ? versions.get(i.current_version_id)!.versions : bundle.versions,
      })
    }
    if (rpc === 'save_reward_item') {
      const parsed = rewardInputSchema.safeParse(b.configuration)
      if (!parsed.success) return respond({ message: 'Invalid reward' }, 400)
      const errors = b.publish ? publishErrors(parsed.data) : []
      if (errors.length) return respond({ message: errors.join(', ') }, 400)
      if (b.item_id && items.get(b.item_id)?.revision !== b.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
      return respond(put(parsed.data, b.publish, b.item_id ?? undefined).id)
    }
    if (rpc === 'archive_reward_item') {
      const i = items.get(b.target)!
      i.status = 'archived'
      i.revision++
      return respond(null)
    }
    if (rpc === 'create_reward_template') {
      const i = items.get(b.target_item)!
      templates.push({
        id: id(++sequence),
        organization_id: organizationA,
        name: b.template_name,
        description: b.template_description,
        kind: i.kind,
        category_id: i.category_id!,
        defaults: { ...i.configuration, actual_unit_minor: null },
      })
      return respond(id(sequence))
    }
    if (rpc === 'save_reward_category') {
      categories.push({
        id: id(++sequence),
        organization_id: organizationA,
        name: b.new_name,
        description: b.new_description,
        active: b.is_active,
        revision: 1,
      })
      return respond(id(sequence))
    }
    if (rpc === 'get_reward_plan') return respond(plans.get(b.target))
    if (rpc === 'save_group_reward_plan') {
      const group = base.groups.get(b.target)!
      const p = previewPlan(
        group.configuration,
        b.lines,
        new Map(
          [...versions].map(([vid, b]) => [
            vid,
            {
              ...items.get(b.item.id)!,
              current_version_id: vid,
              configuration: b.configuration,
              pricing: b.pricing,
            },
          ]),
        ),
        b.plan_name,
      )
      p.plan_id = id(++sequence)
      plans.set(p.plan_id, p)
      group.configuration = {
        ...group.configuration,
        reward: {
          ...group.configuration.reward,
          plan_id: p.plan_id,
          title: p.name,
          unit_cost_minor: 0,
        },
      }
      group.group.revision++
      group.group.latest_version_id = id(++sequence)
      return respond(p.plan_id)
    }
    return respond(null)
  })
  return { ...base, items, versions, plans, put }
}
