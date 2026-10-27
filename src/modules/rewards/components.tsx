import { useId, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-display/components'
import { FieldDesigner } from '@/modules/repa/field-designer'
import { type FieldDefinition, type GroupConfig } from '@/modules/repa/config'
import {
  exactMoney,
  applicableAttributes,
  kindLabel,
  rewardKinds,
  type RewardInput,
  type RewardAttribute,
  type PriceSummary,
  type PlanCosts,
} from './config'
import { planAllocations } from './pricing'
import { rewardFileUrl, saveCategory, type CatalogItem, type RewardCategory } from './service'
import './styles.css'
function RewardFileLink({ path, label }: { path: string; label: string }) {
  const query = useQuery({
    queryKey: ['reward-file', path],
    queryFn: () => rewardFileUrl(path),
    staleTime: 50000,
  })
  return query.data ? (
    <a
      className="button button-secondary"
      href={query.data}
      target="_blank"
      rel="noopener noreferrer"
    >
      View {label}
    </a>
  ) : query.isError ? (
    <Button variant="ghost" onClick={() => void query.refetch()}>
      Retry {label}
    </Button>
  ) : (
    <span>Loading attachment…</span>
  )
}
function AttributeValues({
  fields,
  values,
  currency,
}: {
  fields: FieldDefinition[]
  values: Record<string, unknown>
  currency: string
}) {
  return (
    <dl className="profile-details">
      {fields
        .filter((f) => !f.condition || values[f.condition.key] === f.condition.equals)
        .map((f) => {
          const value = values[f.key]
          return (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd className="repa-terms">
                {value == null || value === '' ? (
                  'Not set'
                ) : (f.type === 'file' || f.type === 'image') && typeof value === 'string' ? (
                  <RewardFileLink path={value} label={f.label} />
                ) : f.type === 'repeating' && Array.isArray(value) ? (
                  value.map((row, i) => (
                    <div className="reward-component-row" key={i}>
                      <strong>Item {i + 1}</strong>
                      <AttributeValues
                        fields={f.children ?? []}
                        values={row as Record<string, unknown>}
                        currency={currency}
                      />
                    </div>
                  ))
                ) : f.type === 'currency' && typeof value === 'number' ? (
                  exactMoney(value, currency)
                ) : typeof value === 'boolean' ? (
                  value ? (
                    'Yes'
                  ) : (
                    'No'
                  )
                ) : Array.isArray(value) ? (
                  value.join(', ')
                ) : (
                  String(value)
                )}
              </dd>
            </div>
          )
        })}
    </dl>
  )
}
export function RewardAttributes({ configuration }: { configuration: RewardInput }) {
  return (
    <AttributeValues
      fields={applicableAttributes(configuration)}
      values={configuration.values}
      currency={configuration.currency}
    />
  )
}
export function RewardUnitDetails({ configuration: c }: { configuration: RewardInput }) {
  return (
    <>
      <p>
        {c.quantity} unit(s) per reward bundle.
        {c.kind === 'mixed'
          ? ' Component quantities apply to each mixed unit.'
          : ` ${c.kind === 'cash' ? 'Declared payout' : 'Estimated price'} per unit: ${exactMoney(c.estimated_unit_minor, c.currency)}.`}
      </p>
      {c.actual_unit_minor !== null && (
        <p>Recorded actual price per unit: {exactMoney(c.actual_unit_minor, c.currency)}.</p>
      )}
    </>
  )
}
export function PricingCards({
  pricing: p,
  currency,
}: {
  pricing: PriceSummary
  currency: string
}) {
  return (
    <section className="panel component-spacing">
      <h2>Reward pricing calculator</h2>
      <p>
        All prices use exact minor units. Shipping and additional expenses apply once per configured
        bundle; mixed components retain their own disclosed costs.
      </p>
      <div className="reward-price-grid">
        {[
          ['Estimated fulfillment', p.estimated_minor],
          ['Actual fulfillment', p.actual_minor],
          ['Shipping / delivery', p.delivery_minor],
          ['Additional expenses', p.additional_minor],
          ['Required funding', p.required_minor],
          ['Actual minus estimated', p.funding_difference_minor],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value === null ? 'Not yet known' : exactMoney(value, currency)}</strong>
          </div>
        ))}
      </div>
      {p.errors.length > 0 && (
        <ul className="repa-validation" role="alert">
          {p.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <p>
        Funding uses the greater of estimated and known actual costs. A lower actual price does not
        silently reduce accepted commitments.
      </p>
    </section>
  )
}
export function RewardGallery({ images }: { images: RewardInput['images'] }) {
  const [selected, setSelected] = useState<number | null>(null)
  const title = useId()
  const query = useQuery({
    queryKey: ['reward-media', images.map((i) => i.path)],
    enabled: images.length > 0,
    staleTime: 50000,
    queryFn: () => Promise.all(images.map((i) => rewardFileUrl(i.path))),
  })
  if (!images.length) return <p className="field-hint">No reward images yet.</p>
  if (query.isError)
    return (
      <p role="alert">
        Images unavailable.{' '}
        <Button variant="ghost" onClick={() => void query.refetch()}>
          Retry gallery
        </Button>
      </p>
    )
  return (
    <>
      <div className="reward-gallery">
        {query.data?.map((url, n) => (
          <button
            type="button"
            key={images[n].path}
            onClick={() => setSelected(n)}
            aria-label={`View ${images[n].alt}`}
          >
            <img src={url} alt={images[n].alt} loading="lazy" />
          </button>
        ))}
      </div>
      {selected !== null && query.data?.[selected] && (
        <Modal
          onClose={() => setSelected(null)}
          busy={false}
          labelledBy={title}
          className="reward-lightbox"
        >
          <h2 id={title}>{images[selected].alt}</h2>
          <img
            className="reward-full-image"
            src={query.data[selected]}
            alt={images[selected].alt}
          />
          <div className="actions component-spacing">
            <Button
              variant="secondary"
              disabled={selected === 0}
              onClick={() => setSelected(selected - 1)}
            >
              Previous image
            </Button>
            <Button
              variant="secondary"
              disabled={selected === images.length - 1}
              onClick={() => setSelected(selected + 1)}
            >
              Next image
            </Button>
            <Button onClick={() => setSelected(null)}>Close gallery</Button>
          </div>
        </Modal>
      )}
    </>
  )
}
export function AttributeBuilder({
  attributes,
  kind,
  onChange,
}: {
  attributes: RewardAttribute[]
  kind: RewardInput['kind']
  onChange: (attrs: RewardAttribute[]) => void
}) {
  return (
    <div>
      <FieldDesigner
        fields={attributes.map((a) => a.definition)}
        category="reward"
        onChange={(fields: FieldDefinition[]) =>
          onChange(
            fields.map((f, i) => ({
              definition: f,
              applies_to: attributes.find((a) => a.definition.key === f.key)?.applies_to ??
                attributes[i]?.applies_to ?? [kind],
            })),
          )
        }
      />
      {attributes.map((a, i) => (
        <fieldset key={a.definition.key} className="component-spacing">
          <legend>{a.definition.label}: applicable reward types</legend>
          <div className="reward-type-options">
            {rewardKinds.map((k) => (
              <label className="checkbox-label" key={k}>
                <input
                  type="checkbox"
                  checked={a.applies_to.includes(k)}
                  onChange={(e) =>
                    onChange(
                      attributes.map((old, n) =>
                        n === i
                          ? {
                              ...old,
                              applies_to: e.target.checked
                                ? [...old.applies_to, k]
                                : old.applies_to.filter((t) => t !== k),
                            }
                          : old,
                      ),
                    )
                  }
                />
                {kindLabel(k)}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
export function RewardSelectionModal({
  items,
  onSelect,
  onClose,
  exclude = [],
  currency,
  allowMixed = true,
}: {
  items: CatalogItem[]
  onSelect: (item: CatalogItem) => void
  onClose: () => void
  exclude?: string[]
  currency?: string
  allowMixed?: boolean
}) {
  const id = useId()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const eligible = items.filter(
    (i) =>
      i.status === 'published' &&
      (!currency || i.currency === currency) &&
      !exclude.includes(i.current_version_id) &&
      (allowMixed || i.kind !== 'mixed'),
  )
  const categories = [...new Map(eligible.map((i) => [i.category_id, i.category_name])).entries()]
  return (
    <Modal onClose={onClose} busy={false} labelledBy={id} className="reward-selector">
      <h2 id={id}>Select a reward</h2>
      <div className="reward-filter">
        <label>
          Search catalog
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Reward category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map(([key, name]) => (
              <option key={key} value={key ?? ''}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DataTable
        caption="Published rewards"
        rows={eligible.filter(
          (i) =>
            i.name.toLowerCase().includes(search.toLowerCase()) &&
            (category === 'all' || i.category_id === category),
        )}
        rowKey={(i) => i.current_version_id}
        columns={[
          {
            key: 'name',
            header: 'Reward',
            render: (i) => (
              <>
                {i.name}
                <small className="reward-subtitle">
                  {kindLabel(i.kind)} · {i.category_name}
                </small>
              </>
            ),
          },
          {
            key: 'cost',
            header: 'Required per bundle',
            render: (i) => exactMoney(i.pricing.required_minor, i.currency),
          },
          {
            key: 'select',
            header: 'Actions',
            render: (i) => <Button onClick={() => onSelect(i)}>Select {i.name}</Button>,
          },
        ]}
      />
      <Button variant="secondary" className="component-spacing" onClick={onClose}>
        Close selection
      </Button>
    </Modal>
  )
}
export function CategoryDialog({
  organizationId,
  categories,
  onClose,
}: {
  organizationId: string
  categories: RewardCategory[]
  onClose: () => void
}) {
  const id = useId()
  const cache = useQueryClient()
  const [category, setCategory] = useState<RewardCategory | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const mutation = useMutation({
    mutationFn: () => saveCategory(organizationId, category, name, description, active),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['reward-catalog'] })
      toast.success('Reward category saved.')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Modal labelledBy={id} busy={mutation.isPending} onClose={onClose}>
      <h2 id={id}>Manage reward categories</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <label>
          Category to edit
          <select
            value={category?.id ?? ''}
            onChange={(e) => {
              const c = categories.find((c) => c.id === e.target.value) ?? null
              setCategory(c)
              setName(c?.name ?? '')
              setDescription(c?.description ?? '')
              setActive(c?.active ?? true)
            }}
          >
            <option value="">Create a new category</option>
            {categories
              .filter((c) => c.organization_id === organizationId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Category name
          <input
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Category description
          <textarea
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Available for new rewards
        </label>
        <p>
          System starter categories are read-only. Your organization can add and archive its own
          categories.
        </p>
        <div className="actions">
          <Button type="submit" disabled={mutation.isPending}>
            Save category
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
export function RewardPlanSummary({
  configuration: c,
  plan: p,
}: {
  configuration: GroupConfig
  plan: PlanCosts
}) {
  return (
    <section className="panel component-spacing">
      <h2>Assigned reward plan</h2>
      <p>
        {p.name}. Item versions and prices are fixed for this rules snapshot; later catalog edits do
        not change it.
      </p>
      <div className="reward-price-grid">
        {[
          ['Estimated total', p.estimated_minor],
          ['Known actual total', p.actual_minor],
          ['Required total', p.required_minor],
          ['Delivery fees', p.delivery_minor],
          ['Additional expenses', p.additional_minor],
        ].map(([label, v]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{v === null ? 'Not yet known' : exactMoney(v, p.currency)}</strong>
          </div>
        ))}
      </div>
      <DataTable
        caption="Reward assignments"
        rows={p.lines}
        rowKey={(l) => `${l.version_id}:${l.scope}:${l.round_number}`}
        columns={[
          {
            key: 'name',
            header: 'Reward',
            render: (l) => (
              <>
                {l.name}
                <small className="reward-subtitle">{kindLabel(l.kind)}</small>
              </>
            ),
          },
          {
            key: 'round',
            header: 'Allocation',
            render: (l) => (l.scope === 'each_payout' ? 'Every payout' : `Round ${l.round_number}`),
          },
          { key: 'quantity', header: 'Bundles per recipient', render: (l) => l.quantity },
          {
            key: 'cost',
            header: 'Funding per bundle',
            render: (l) => exactMoney(l.pricing.required_minor, p.currency),
          },
        ]}
      />
      {p.lines.map((l) => (
        <details
          className="reward-detail-fold"
          key={`${l.version_id}:${l.scope}:${l.round_number}`}
        >
          <summary>{l.name}: details and images</summary>
          <p>{l.configuration.description}</p>
          <RewardUnitDetails configuration={l.configuration} />
          <p>
            {[l.configuration.brand, l.configuration.model, l.configuration.sku]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p>{l.configuration.delivery_method || l.configuration.cash_transfer_method}</p>
          <p>{l.configuration.warranty}</p>
          {l.components?.length ? (
            <>
              <h3>Included component versions</h3>
              {l.components.map((component) => (
                <div className="reward-component-row" key={component.version_id}>
                  <h4>
                    {component.quantity} × {component.name}
                  </h4>
                  <p>
                    {component.configuration.quantity} unit(s) per component bundle ·{' '}
                    {exactMoney(component.pricing.required_minor, p.currency)}
                  </p>
                  <p>{component.configuration.description}</p>
                  <RewardUnitDetails configuration={component.configuration} />
                  <p>
                    {component.configuration.cash_transfer_method ||
                      component.configuration.delivery_method}
                  </p>
                  <RewardGallery images={component.configuration.images} />
                  <RewardAttributes configuration={component.configuration} />
                </div>
              ))}
            </>
          ) : null}
          <RewardGallery images={l.configuration.images} />
          <RewardAttributes configuration={l.configuration} />
        </details>
      ))}
      <h3 className="component-spacing">Recipient allocation preview</h3>
      <p>
        Round eligibility and payout approval rules still apply. Random selection is not executed
        here. Pooled rounding uses largest remainders, with member slot order breaking ties.
      </p>
      <DataTable
        caption="Catalog reward allocation preview"
        rows={planAllocations(c, p)}
        rowKey={(r) => `${r.round}:${r.slot}`}
        columns={[
          { key: 'round', header: 'Round', render: (r) => r.round },
          {
            key: 'slot',
            header: 'Recipient',
            render: (r) => (r.slot === null ? 'Eligible draw recipient' : `Member slot ${r.slot}`),
          },
          {
            key: 'value',
            header: 'Planned value / cost',
            render: (r) => exactMoney(r.value_minor, p.currency),
          },
          { key: 'units', header: 'Reward units', render: (r) => r.units },
        ]}
      />
      {p.errors.length > 0 && (
        <ul role="alert" className="repa-validation">
          {p.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
