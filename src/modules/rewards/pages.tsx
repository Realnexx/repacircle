import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAccess } from '@/app/providers/access'
import { useSession } from '@/modules/auth/session'
import { PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import { SchemaForm, setPath, type RenderField } from '@/modules/repa/schema-form'
import {
  defaultReward,
  rewardInputSchema,
  rewardKinds,
  kindLabel,
  publishErrors,
  rewardPricing,
  exactMoney,
  applicableAttributes,
  type RewardInput,
} from './config'
import {
  getCatalog,
  getReward,
  saveReward,
  archiveReward,
  createTemplate,
  uploadRewardFile,
  rewardFileUrl,
  type Catalog,
  type RewardBundle,
  type CatalogItem,
} from './service'
import {
  PricingCards,
  RewardGallery,
  AttributeBuilder,
  RewardSelectionModal,
  CategoryDialog,
  RewardAttributes,
  RewardUnitDetails,
} from './components'
import './styles.css'

export default function RewardCatalog() {
  const { session } = useSession()
  const access = useAccess()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [categories, setCategories] = useState(false)
  const query = useQuery({
    queryKey: ['reward-catalog', access.organizationId],
    enabled: Boolean(session && access.organizationId),
    queryFn: () => getCatalog(access.organizationId!),
  })
  return (
    <>
      <PageHeader
        title="Reward catalog"
        eyebrow="DYNAMIC REWARDS"
        description="Reusable cash, products, services and mixed bundles, with exact pricing and versioned group assignments."
        actions={
          session &&
          access.organizationId && (
            <Link className="button" to="/organizer/rewards/new">
              Create reward
            </Link>
          )
        }
      />
      {!session ? (
        <EmptyState
          title="Your organization’s rewards"
          description="Sign in to create and manage your reward catalog."
          action={
            <Link className="button" to="/login">
              Sign in
            </Link>
          }
        />
      ) : !access.organizationId ? (
        <EmptyState description="Choose an organization to manage its rewards." />
      ) : query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>Start from a template</h2>
              <Button variant="secondary" onClick={() => setCategories(true)}>
                Manage categories
              </Button>
            </div>
            <p>
              Templates define fields and fulfillment details. Enter your own verified prices before
              publishing.
            </p>
            <div className="reward-template-list">
              {query.data.templates.map((t) => (
                <Link
                  className="button button-secondary"
                  key={t.id}
                  to="/organizer/rewards/new"
                  state={{ template: t.defaults }}
                >
                  {t.name}
                </Link>
              ))}
            </div>
          </section>
          <section className="panel component-spacing">
            <h2>Organization rewards</h2>
            <div className="reward-filter">
              <label>
                Search rewards
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <label>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="all">All categories</option>
                  {query.data.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reward type
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="all">All types</option>
                  {rewardKinds.map((k) => (
                    <option key={k} value={k}>
                      {kindLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Catalog status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  {['draft', 'published', 'archived'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <div className="reward-catalog-grid">
            {query.data.items
              .filter(
                (i) =>
                  i.name.toLowerCase().includes(search.toLowerCase()) &&
                  (category === 'all' || i.category_id === category) &&
                  (type === 'all' || i.kind === type) &&
                  (status === 'all' || i.status === status),
              )
              .map((i) => (
                <article className="panel reward-catalog-card" key={i.id}>
                  <small>
                    {i.category_name} · {i.status} · v{i.revision}
                  </small>
                  <h2>{i.name}</h2>
                  <p>
                    {kindLabel(i.kind)} · {i.configuration.quantity} unit(s) per bundle
                  </p>
                  <strong className="reward-card-price">
                    {exactMoney(i.pricing.required_minor, i.currency)}
                  </strong>
                  <p>{i.configuration.description}</p>
                  <Link className="button button-secondary" to={`/organizer/rewards/${i.id}`}>
                    View {i.name}
                  </Link>
                </article>
              ))}
          </div>
          {!query.data.items.length && (
            <EmptyState description="No catalog rewards yet. Choose a starter template or create your own reward." />
          )}
          {categories && (
            <CategoryDialog
              organizationId={access.organizationId}
              categories={query.data.categories}
              onClose={() => setCategories(false)}
            />
          )}
        </>
      )}
    </>
  )
}

export function RewardEditor() {
  const { rewardId } = useParams()
  const { session } = useSession()
  const access = useAccess()
  const location = useLocation()
  const catalog = useQuery({
    queryKey: ['reward-catalog', access.organizationId],
    enabled: Boolean(session && access.organizationId),
    queryFn: () => getCatalog(access.organizationId!),
  })
  const item = useQuery({
    queryKey: ['reward', rewardId],
    enabled: Boolean(session && rewardId),
    queryFn: () => getReward(rewardId!),
  })
  if (!session || !access.organizationId)
    return <EmptyState description="Sign in and choose an organization to edit rewards." />
  if (catalog.isError || item.isError)
    return (
      <ErrorState
        message={catalog.error?.message ?? item.error!.message}
        onRetry={() => {
          void catalog.refetch()
          if (rewardId) void item.refetch()
        }}
      />
    )
  if (catalog.isPending || (rewardId && item.isPending)) return <LoadingSkeleton />
  if (item.data && !item.data.can_manage)
    return <ErrorState message="You do not have permission to edit this reward." />
  const template = rewardInputSchema.safeParse(location.state?.template)
  return (
    <EditReward
      key={`${access.organizationId}:${rewardId ?? 'new'}:${item.data?.item.revision ?? 0}`}
      organizationId={access.organizationId}
      catalog={catalog.data}
      bundle={item.data}
      initial={item.data?.configuration ?? (template.success ? template.data : defaultReward())}
    />
  )
}
function EditReward({
  organizationId,
  catalog,
  bundle,
  initial,
}: {
  organizationId: string
  catalog: Catalog
  bundle?: RewardBundle
  initial: RewardInput
}) {
  const [value, setValue] = useState(initial)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [uploads, setUploads] = useState(0)
  const [select, setSelect] = useState(false)
  const [extraComponents, setExtraComponents] = useState<CatalogItem[]>([])
  const cache = useQueryClient()
  const navigate = useNavigate()
  const set = (path: string, v: unknown) => setValue((old) => setPath(old, path, v) as RewardInput)
  const source = new Map(
    catalog.items.filter((i) => i.status === 'published').map((i) => [i.current_version_id, i]),
  )
  const prices = new Map([...source].map(([id, i]) => [id, i.pricing]))
  bundle?.components.forEach((c) => prices.set(c.version_id, c.pricing))
  extraComponents.forEach((i) => prices.set(i.current_version_id, i.pricing))
  const parsed = rewardInputSchema.safeParse(value)
  const pricing = parsed.success ? rewardPricing(parsed.data, prices) : null
  const storage = {
    upload: async (file: File, image: boolean) => {
      setUploads((n) => n + 1)
      try {
        return await uploadRewardFile(organizationId, file, image)
      } finally {
        setUploads((n) => n - 1)
      }
    },
    url: rewardFileUrl,
  }
  async function save(publish: boolean) {
    const parsed = rewardInputSchema.safeParse(value)
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`))
      return
    }
    const problems = [
      ...(publish ? publishErrors(parsed.data) : []),
      ...rewardPricing(parsed.data, prices).errors,
    ]
    if (problems.length) {
      setErrors(problems)
      return
    }
    setErrors([])
    setBusy(true)
    try {
      const id = await saveReward(
        organizationId,
        bundle?.item.id ?? null,
        bundle?.item.revision ?? 0,
        parsed.data,
        publish,
      )
      await cache.invalidateQueries({ queryKey: ['reward-catalog'] })
      await cache.invalidateQueries({ queryKey: ['reward', id] })
      toast.success(
        publish ? 'Reward published as a new immutable version.' : 'Reward draft saved.',
      )
      navigate(`/organizer/rewards/${id}`)
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Unable to save reward.'])
    } finally {
      setBusy(false)
    }
  }
  const fields: RenderField[] = [
    { key: 'name', label: 'Reward name', type: 'text', required: true, min: 2, max: 150 },
    { key: 'description', label: 'Description', type: 'textarea', required: false, max: 4000 },
    {
      key: 'currency',
      label: 'Currency',
      type: 'select',
      required: true,
      options: ['PHP', 'USD', 'EUR'],
    },
    ...(value.kind !== 'mixed'
      ? ([
          {
            key: 'estimated_unit_minor',
            label: value.kind === 'cash' ? 'Payout amount per unit' : 'Estimated price per unit',
            type: 'currency',
            required: true,
            min: 0,
            max: 1e9,
          },
          {
            key: 'actual_unit_minor',
            label: 'Actual purchase / payout price per unit (optional)',
            type: 'currency',
            required: false,
            min: 0,
            max: 1e9,
          },
        ] as RenderField[])
      : []),
    {
      key: 'quantity',
      label: 'Units per reward bundle',
      type: 'number',
      required: true,
      min: 1,
      max: 1000,
    },
    ...(value.kind === 'physical_product'
      ? ([
          { key: 'brand', label: 'Brand', type: 'text', required: false, max: 120 },
          { key: 'model', label: 'Model', type: 'text', required: false, max: 120 },
          { key: 'sku', label: 'SKU', type: 'text', required: false, max: 100 },
          { key: 'supplier', label: 'Supplier', type: 'text', required: false, max: 250 },
          { key: 'warranty', label: 'Warranty', type: 'textarea', required: false, max: 2000 },
        ] as RenderField[])
      : []),
    {
      key: value.kind === 'cash' ? 'cash_transfer_method' : 'delivery_method',
      label: value.kind === 'cash' ? 'Transfer method' : 'Delivery / fulfillment method',
      type: 'textarea',
      required: true,
      max: value.kind === 'cash' ? 200 : 1000,
    },
    ...(value.kind !== 'cash'
      ? ([
          {
            key: 'shipping_fee_minor',
            label: 'Shipping / delivery fee per bundle',
            type: 'currency',
            required: true,
            min: 0,
            max: 1e9,
          },
        ] as RenderField[])
      : []),
    {
      key: 'expenses',
      label: 'Additional expenses per bundle',
      type: 'repeating',
      required: false,
      max: 20,
      children: [
        { key: 'label', label: 'Expense name', type: 'text', required: true, max: 150 },
        {
          key: 'amount_minor',
          label: 'Expense amount',
          type: 'currency',
          required: true,
          min: 0,
          max: 1e9,
        },
      ],
    },
  ]
  return (
    <>
      <PageHeader
        title={bundle ? 'Edit reward' : 'Create reward'}
        description="Save a reusable draft or publish a validated version. Assigned group rewards retain their original version."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save(true)
        }}
      >
        <fieldset className="reward-editor-fieldset" disabled={busy}>
          <section className="panel">
            <h2>Reward details</h2>
            <div className="repa-fields">
              <label>
                Reward type
                <select
                  value={value.kind}
                  onChange={(e) => {
                    const kind = e.target.value as RewardInput['kind']
                    setValue((v) => ({
                      ...v,
                      kind,
                      components: kind === 'mixed' ? v.components : [],
                      ...(kind === 'mixed'
                        ? { estimated_unit_minor: 0, actual_unit_minor: null }
                        : {}),
                      ...(kind === 'cash' ? { shipping_fee_minor: 0 } : {}),
                    }))
                  }}
                >
                  {rewardKinds.map((k) => (
                    <option key={k} value={k}>
                      {kindLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reward category
                <select
                  value={value.category_id ?? ''}
                  onChange={(e) => set('category_id', e.target.value || null)}
                >
                  <option value="">Choose a category</option>
                  {catalog.categories
                    .filter((c) => c.active || c.id === value.category_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.active ? '' : ' (unavailable)'}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <SchemaForm fields={fields} values={value} onChange={set} />
          </section>
          {value.kind === 'mixed' && (
            <section className="panel component-spacing">
              <h2>Mixed reward components</h2>
              <p>
                Select at least two published components in the same currency. Component versions
                and their costs are pinned.
              </p>
              {value.components.map((c, i) => (
                <div className="reward-component-row" key={c.version_id}>
                  <strong>
                    {source.get(c.version_id)?.name ??
                      extraComponents.find((s) => s.current_version_id === c.version_id)?.name ??
                      bundle?.components.find((s) => s.version_id === c.version_id)?.name ??
                      'Component'}
                  </strong>
                  <label>
                    Component bundles
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={c.quantity}
                      onChange={(e) =>
                        set(
                          'components',
                          value.components.map((v, n) =>
                            n === i ? { ...v, quantity: Number(e.target.value) } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      set(
                        'components',
                        value.components.filter((_, n) => n !== i),
                      )
                    }
                  >
                    Remove component
                  </Button>
                </div>
              ))}
              <Button variant="secondary" onClick={() => setSelect(true)}>
                Add component
              </Button>
            </section>
          )}
          <section className="panel component-spacing">
            <h2>Dynamic attributes</h2>
            <AttributeBuilder
              kind={value.kind}
              attributes={value.attributes}
              onChange={(attrs) =>
                setValue((old) => ({
                  ...old,
                  attributes: attrs,
                  values: Object.fromEntries(
                    Object.entries(old.values).filter(([k]) =>
                      attrs.some((a) => a.definition.key === k),
                    ),
                  ),
                }))
              }
            />
            <h3 className="component-spacing">Attribute values</h3>
            <SchemaForm
              fields={applicableAttributes(value)}
              values={value.values}
              onChange={(p, v) => set('values', setPath(value.values, p, v))}
              fileStorage={storage}
            />
          </section>
          <section className="panel component-spacing">
            <h2>Reward gallery</h2>
            <p>
              Up to 10 images, PNG, JPEG or WebP, 2 MB each. Images are private to authorized reward
              viewers.
            </p>
            <label>
              Add reward image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploads > 0 || value.images.length >= 10}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  try {
                    const path = await storage.upload(file, true)
                    setValue((v) => ({ ...v, images: [...v.images, { path, alt: v.name }] }))
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Image upload failed.')
                  }
                }}
              />
            </label>
            {uploads > 0 && <p role="status">Uploading reward file…</p>}
            {value.images.map((image, i) => (
              <div className="reward-component-row" key={image.path}>
                <label>
                  Image {i + 1} description
                  <input
                    maxLength={200}
                    value={image.alt}
                    onChange={(e) =>
                      set(
                        'images',
                        value.images.map((v, n) => (n === i ? { ...v, alt: e.target.value } : v)),
                      )
                    }
                  />
                </label>
                <Button
                  variant="ghost"
                  onClick={() =>
                    set(
                      'images',
                      value.images.filter((_, n) => n !== i),
                    )
                  }
                >
                  Remove image {i + 1}
                </Button>
              </div>
            ))}
            <RewardGallery images={value.images} />
          </section>
          {pricing && <PricingCards pricing={pricing} currency={value.currency} />}
          {errors.length > 0 && (
            <ul className="repa-validation component-spacing" role="alert">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <div className="actions component-spacing">
            <Button type="submit" disabled={busy || uploads > 0}>
              {busy ? 'Saving…' : 'Publish reward'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || uploads > 0}
              onClick={() => void save(false)}
            >
              Save reward draft
            </Button>
            <Link className="button button-ghost" to="/organizer/rewards">
              Cancel
            </Link>
          </div>
        </fieldset>
      </form>
      {select && (
        <RewardSelectionModal
          items={catalog.items}
          currency={value.currency}
          allowMixed={false}
          exclude={value.components.map((c) => c.version_id)}
          onClose={() => setSelect(false)}
          onSelect={(i) => {
            setExtraComponents((v) => [...v, i])
            setValue((v) => ({
              ...v,
              components: [...v.components, { version_id: i.current_version_id, quantity: 1 }],
            }))
            setSelect(false)
          }}
        />
      )}
    </>
  )
}

export function RewardDetail() {
  const { rewardId } = useParams()
  const [selected, setSelected] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const cache = useQueryClient()
  const q = useQuery({
    queryKey: ['reward', rewardId, selected],
    enabled: Boolean(rewardId),
    queryFn: () => getReward(rewardId!, selected),
  })
  if (q.isPending) return <LoadingSkeleton />
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
  const b = q.data,
    c = b.configuration
  async function act(action: 'archive' | 'template') {
    setBusy(true)
    try {
      if (action === 'archive') await archiveReward(b.item.id, b.item.revision)
      else await createTemplate(b.item.id, templateName, c.description)
      await cache.invalidateQueries({ queryKey: ['reward'] })
      await cache.invalidateQueries({ queryKey: ['reward-catalog'] })
      setTemplateName('')
      toast.success(
        action === 'archive'
          ? 'Reward archived. Existing group snapshots are preserved.'
          : 'Reusable reward template created.',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to update reward.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeader
        title={c.name}
        eyebrow={`${kindLabel(c.kind)} · ${b.item.status}`}
        description={c.description}
        actions={
          b.can_manage && (
            <Link className="button" to={`/organizer/rewards/${b.item.id}/edit`}>
              Edit reward
            </Link>
          )
        }
      />
      <section className="panel">
        <h2>Reward details</h2>
        <dl className="profile-details">
          {[
            ['Category', b.category_name],
            ['Brand', c.brand],
            ['Model', c.model],
            ['SKU', c.sku],
            ['Quantity per bundle', String(c.quantity)],
            ['Supplier', c.supplier],
            ['Warranty', c.warranty],
            ['Delivery / transfer', c.kind === 'cash' ? c.cash_transfer_method : c.delivery_method],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="repa-terms">{v}</dd>
              </div>
            ))}
        </dl>
        <RewardUnitDetails configuration={c} />
        <RewardAttributes configuration={c} />
        <RewardGallery images={c.images} />
        {b.components.length > 0 && (
          <>
            <h3>Mixed components</h3>
            {b.components.map((i) => (
              <p key={i.version_id}>
                {i.quantity} × {i.name} · {exactMoney(i.pricing.required_minor, c.currency)} per
                component bundle
              </p>
            ))}
          </>
        )}
      </section>
      <PricingCards pricing={b.pricing} currency={c.currency} />
      {b.can_manage && (
        <section className="panel component-spacing">
          <h2>Immutable version history</h2>
          <label>
            View reward version
            <select
              value={selected ?? b.item.current_version_id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {b.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version_number} · {v.published ? 'published' : 'draft'} ·{' '}
                  {new Date(v.created_at).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <p>
            Catalog edits create new versions. Existing REPA assignments continue to use the version
            accepted by members.
          </p>
          <p>Templates use the latest published catalog version.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void act('template')
            }}
          >
            <label>
              Reusable template name
              <input
                required
                minLength={2}
                maxLength={150}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={busy || b.item.status !== 'published'}>
              Save as template
            </Button>
          </form>
          <Button
            className="component-spacing"
            variant="secondary"
            disabled={busy || b.item.status === 'archived'}
            onClick={() => void act('archive')}
          >
            Archive reward
          </Button>
        </section>
      )}
      <Link className="button button-ghost component-spacing" to="/organizer/rewards">
        Back to catalog
      </Link>
    </>
  )
}
