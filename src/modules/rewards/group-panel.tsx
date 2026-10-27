import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import { FundingReview } from '@/modules/repa/review'
import type { RepaBundle } from '@/modules/repa/service'
import type { GroupConfig } from '@/modules/repa/config'
import { RewardPlanSummary, RewardSelectionModal } from './components'
import { getCatalog, getPlan, saveGroupPlan, type Catalog, type CatalogItem } from './service'
import { previewPlan } from './pricing'
import { distributionLineSchema, type DistributionLine, type PlanCosts } from './config'

export default function GroupRewardsPanel({ bundle }: { bundle: RepaBundle }) {
  const c = bundle.accepted_configuration ?? bundle.configuration
  const accepted = useQuery({
    queryKey: ['reward-plan', c.reward.plan_id],
    enabled: Boolean(c.reward.plan_id),
    queryFn: () => getPlan(c.reward.plan_id!),
  })
  const latestId = bundle.configuration.reward.plan_id
  const latest = useQuery({
    queryKey: ['reward-plan', latestId],
    enabled: Boolean(bundle.can_manage && latestId),
    queryFn: () => getPlan(latestId!),
  })
  const catalog = useQuery({
    queryKey: ['reward-catalog', bundle.group.organization_id],
    enabled: bundle.can_manage,
    queryFn: () => getCatalog(bundle.group.organization_id),
  })
  if (accepted.isError || latest.isError || catalog.isError)
    return (
      <ErrorState
        message={accepted.error?.message ?? latest.error?.message ?? catalog.error!.message}
        onRetry={() => {
          if (c.reward.plan_id) void accepted.refetch()
          if (latestId) void latest.refetch()
          if (bundle.can_manage) void catalog.refetch()
        }}
      />
    )
  if (
    (c.reward.plan_id && accepted.isPending) ||
    (bundle.can_manage && (catalog.isPending || (latestId && latest.isPending)))
  )
    return <LoadingSkeleton />
  return (
    <>
      {accepted.data && <RewardPlanSummary configuration={c} plan={accepted.data} />}{' '}
      {!c.reward.plan_id && (
        <section className="panel">
          <h2>Group rewards</h2>
          <p>
            This rules version uses the original reward configuration: {c.reward.title}. Organizers
            can assign published catalog rewards below.
          </p>
        </section>
      )}
      {bundle.can_manage && catalog.data && (
        <PlanEditor
          key={bundle.group.latest_version_id}
          bundle={bundle}
          catalog={catalog.data}
          existing={latest.data}
        />
      )}
    </>
  )
}
function PlanEditor({
  bundle,
  catalog,
  existing,
}: {
  bundle: RepaBundle
  catalog: Catalog
  existing?: PlanCosts
}) {
  const c = bundle.configuration,
    g = bundle.group
  const [name, setName] = useState(existing?.name ?? `${g.name} rewards`)
  const [lines, setLines] = useState<DistributionLine[]>(
    existing?.lines.map(({ version_id, scope, round_number, quantity }) => ({
      version_id,
      scope,
      round_number,
      quantity,
    })) ?? [],
  )
  const [select, setSelect] = useState(false)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [summary, setSummary] = useState('Configure catalog reward assignments')
  const [effective, setEffective] = useState('')
  const cache = useQueryClient()
  const items = new Map<string, CatalogItem>(catalog.items.map((i) => [i.current_version_id, i]))
  existing?.lines.forEach((l) => {
    if (!items.has(l.version_id))
      items.set(l.version_id, {
        id: l.item_id,
        name: l.name,
        kind: l.kind,
        category_id: l.configuration.category_id,
        category_name: 'Assigned version',
        currency: l.configuration.currency,
        status: catalog.items.find((i) => i.id === l.item_id)?.status ?? 'archived',
        revision: 0,
        current_version_id: l.version_id,
        configuration: l.configuration,
        pricing: l.pricing,
        components: l.components,
      })
  })
  const validLines = lines.every((l) => distributionLineSchema.safeParse(l).success)
  const plan = validLines ? previewPlan(c, lines, items, name) : null
  const previewConfig: GroupConfig = plan
    ? { ...c, reward: { ...c.reward, plan_id: plan.plan_id } }
    : c
  const update = (index: number, values: Partial<DistributionLine>) => {
    setPreview(false)
    setLines((v) => v.map((l, i) => (i === index ? { ...l, ...values } : l)))
  }
  async function save() {
    if (!validLines || !plan) {
      setErrors(['Choose valid quantities and payout rounds.'])
      return
    }
    if (plan.errors.length) {
      setErrors(plan.errors)
      return
    }
    if (g.accepted_version_id && !effective) {
      setErrors(['Choose a future effective date for this rules proposal.'])
      return
    }
    setBusy(true)
    setErrors([])
    try {
      await saveGroupPlan(
        g.id,
        g.revision,
        name,
        lines,
        summary,
        effective ? new Date(effective).toISOString() : new Date().toISOString(),
      )
      await cache.invalidateQueries({ queryKey: ['repa'] })
      await cache.invalidateQueries({ queryKey: ['reward-plan'] })
      toast.success('Reward plan saved in a new rules version. Fresh member agreement is required.')
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Unable to save reward plan.'])
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <section className="panel component-spacing">
        <h2>
          {g.accepted_version_id
            ? 'Propose future reward assignments'
            : 'Configure reward assignments'}
        </h2>
        <p>
          One selection can repeat at every payout, or choose different rewards for individual
          rounds. Multiple lines allow cash plus products. Quantities are bundles per recipient.
          Pooled rewards are allocated at the final round.
        </p>
        <Link className="button button-secondary" to="/organizer/rewards">
          Open reward catalog
        </Link>
        <fieldset className="reward-editor-fieldset" disabled={busy}>
          <label className="component-spacing">
            Reward plan name
            <input
              required
              minLength={2}
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {lines.map((l, i) => (
            <div className="reward-component-row" key={i}>
              <h3>{items.get(l.version_id)?.name ?? 'Unavailable reward'}</h3>
              <div className="repa-fields">
                <label>
                  Assignment scope
                  <select
                    value={l.scope}
                    onChange={(e) =>
                      update(i, {
                        scope: e.target.value as DistributionLine['scope'],
                        round_number:
                          e.target.value === 'round'
                            ? c.mechanism === 'pooled_savings'
                              ? c.contribution.round_count
                              : 1
                            : null,
                      })
                    }
                  >
                    <option value="each_payout">Every payout</option>
                    <option value="round">Specific round</option>
                  </select>
                </label>
                {l.scope === 'round' && (
                  <label>
                    Payout round
                    <input
                      type="number"
                      min={c.mechanism === 'pooled_savings' ? c.contribution.round_count : 1}
                      max={c.contribution.round_count}
                      value={l.round_number ?? ''}
                      onChange={(e) => update(i, { round_number: Number(e.target.value) })}
                    />
                  </label>
                )}
                <label>
                  Bundles per recipient
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={l.quantity}
                    onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                  />
                </label>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setLines((v) => v.filter((_, n) => n !== i))
                  setPreview(false)
                }}
              >
                Remove assignment {i + 1}
              </Button>
            </div>
          ))}
          <Button
            className="component-spacing"
            variant="secondary"
            disabled={lines.length >= 100}
            onClick={() => setSelect(true)}
          >
            Add reward assignment
          </Button>
          <label className="component-spacing">
            Rules change summary
            <textarea
              required
              minLength={3}
              maxLength={1000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          {g.accepted_version_id && (
            <label>
              Future effective date
              <input
                type="datetime-local"
                required
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
              />
            </label>
          )}
          <p>
            Saving creates immutable assignments and a new configuration version. Accepted rules and
            historical obligations remain attached to their original version.
          </p>
          {errors.length > 0 && (
            <ul role="alert" className="repa-validation">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <div className="actions component-spacing">
            <Button variant="secondary" disabled={!validLines} onClick={() => setPreview(true)}>
              Preview reward funding
            </Button>
            <Button
              disabled={
                busy || !lines.length || name.trim().length < 2 || summary.trim().length < 3
              }
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save reward plan'}
            </Button>
          </div>
        </fieldset>
      </section>
      {preview && plan && (
        <>
          <RewardPlanSummary configuration={previewConfig} plan={plan} />
          <FundingReview configuration={previewConfig} plan={plan} />
        </>
      )}
      {select && (
        <RewardSelectionModal
          currency={c.basic.currency}
          items={catalog.items}
          onClose={() => setSelect(false)}
          onSelect={(item) => {
            setLines((v) => [
              ...v,
              {
                version_id: item.current_version_id,
                scope: 'each_payout',
                round_number: null,
                quantity: 1,
              },
            ])
            setSelect(false)
            setPreview(false)
          }}
        />
      )}
    </>
  )
}
