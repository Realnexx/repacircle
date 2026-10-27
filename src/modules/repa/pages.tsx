import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAccess } from '@/app/providers/access'
import { useSession } from '@/modules/auth/session'
import { environment } from '@/lib/validation/env'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page'
import { ErrorState, LoadingSkeleton, EmptyState } from '@/components/feedback/states'
import { StatusBadge } from '@/components/data-display/components'
import {
  configSchema,
  defaultConfig,
  draftSchema,
  type GroupConfig,
  type FieldDefinition,
} from './config'
import { SchemaForm, setPath } from './schema-form'
import { FieldDesigner } from './field-designer'
import { FundingReview, ActivationPanel } from './review'
import { getRepaGroup, listRepaGroups, saveRepaDraft, type RepaBundle } from './service'
import { stepFields, wizardSteps } from './wizard-fields'
import './styles.css'

export default function RepaList({ embedded = false }: { embedded?: boolean }) {
  const access = useAccess()
  const { session } = useSession()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [mechanism, setMechanism] = useState('all')
  const query = useQuery({
    queryKey: ['repa', 'list', access.organizationId],
    enabled: Boolean(session && access.organizationId),
    queryFn: () => listRepaGroups(access.organizationId!),
  })
  const manage = access.can('groups.manage')
  const prefix = manage ? '/organizer/groups' : '/member/repa'
  const rows = (query.data ?? []).filter(
    (g) =>
      (status === 'all' || g.status === status) &&
      (mechanism === 'all' || g.mechanism === mechanism) &&
      g.name.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <>
      {!embedded && (
        <PageHeader
          title="Groups"
          eyebrow="DYNAMIC REPA CONFIGURATION"
          description="Create, validate and manage rotating, random draw and pooled savings groups."
          actions={
            manage && (
              <Link className="button" to="/organizer/groups/new">
                Create REPA group
              </Link>
            )
          }
        />
      )}
      {!session ? (
        <section className="panel">
          <EmptyState
            title="Connect your organization"
            description="Sign in to create and manage REPA groups. This preview contains no saved group or financial data."
            action={
              <Link className="button" to="/login">
                Sign in
              </Link>
            }
          />
        </section>
      ) : !access.organizationId ? (
        <EmptyState description="Choose an organization to view its REPA groups." />
      ) : query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section className="panel">
            <div className="repa-list-filters">
              <label>
                Search groups
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <label>
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  {[
                    'draft',
                    'enrollment_open',
                    'enrollment_closed',
                    'active',
                    'paused',
                    'completed',
                    'cancelled',
                    'archived',
                  ].map((s) => (
                    <option value={s} key={s}>
                      {s.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mechanism
                <select value={mechanism} onChange={(e) => setMechanism(e.target.value)}>
                  <option value="all">All mechanisms</option>
                  {['rotating', 'random_draw', 'pooled_savings'].map((s) => (
                    <option value={s} key={s}>
                      {s.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <div className="repa-group-grid component-spacing">
            {rows.map((g) => (
              <article key={g.id} className="panel">
                <div className="section-heading">
                  <StatusBadge status={g.status === 'active' ? 'success' : 'neutral'}>
                    {g.status.replaceAll('_', ' ')}
                  </StatusBadge>
                  <small>v{g.revision}</small>
                </div>
                <h2 className="component-spacing">{g.name || 'Untitled REPA'}</h2>
                <p>{g.description || g.mechanism.replaceAll('_', ' ')}</p>
                <p>
                  {g.mechanism.replaceAll('_', ' ')} · {g.currency} · Starts {g.start_date}
                </p>
                <Link className="button button-secondary" to={`${prefix}/${g.id}`}>
                  Open group
                </Link>
              </article>
            ))}
          </div>
          {rows.length === 0 && (
            <EmptyState
              title="No REPA groups yet"
              description="Create a group with its own contributions, rewards, schedule and accepted rules."
            />
          )}
        </>
      )}
    </>
  )
}
export function RepaEditor() {
  const { groupId } = useParams()
  const access = useAccess()
  const { session } = useSession()
  const query = useQuery({
    queryKey: ['repa', groupId],
    enabled: Boolean(groupId && session),
    queryFn: () => getRepaGroup(groupId!),
  })
  if (!session || environment.mode === 'setup')
    return (
      <>
        <PageHeader title="Create REPA group" />
        <section className="panel">
          <p>Sign in with organizer access to create a group.</p>
          <Link className="button" to="/login">
            Sign in
          </Link>
        </section>
      </>
    )
  if (groupId && query.isPending) return <LoadingSkeleton />
  if (query.isError) return <ErrorState message={query.error.message} />
  if (!access.organizationId)
    return <EmptyState description="Choose an organization before creating a REPA group." />
  if (query.data && !query.data.can_manage)
    return <ErrorState message="Organizer access is required to edit this group." />
  return (
    <Wizard
      key={groupId ?? access.organizationId}
      initial={query.data}
      organizationId={access.organizationId}
    />
  )
}
function Wizard({ initial, organizationId }: { initial?: RepaBundle; organizationId: string }) {
  const access = useAccess()
  const navigate = useNavigate()
  const location = useLocation()
  const cache = useQueryClient()
  const [c, setC] = useState<GroupConfig>(
    () => initial?.configuration ?? defaultConfig(organizationId),
  )
  const [step, setStep] = useState(() =>
    Math.max(0, Math.min(7, Number((location.state as { step?: number } | null)?.step ?? 0))),
  )
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [rotationInput, setRotationInput] = useState(() =>
    (initial?.configuration ?? defaultConfig(organizationId)).distribution.rotation_order.join(
      ', ',
    ),
  )
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(
    initial ? 'Update group configuration' : 'Initial group configuration',
  )
  const [effective, setEffective] = useState(() =>
    initial?.group.accepted_version_id
      ? new Date(Date.now() + 86400000).toISOString().slice(0, 16)
      : '',
  )
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  const change = (path: string, value: unknown) => {
    setDirty(true)
    if (path === 'rotation_order_input') setRotationInput(String(value))
    if (
      path === 'contribution.member_count' &&
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 2 &&
      value <= 1000
    )
      setRotationInput(Array.from({ length: value }, (_, i) => i + 1).join(', '))
    setC((old) => {
      let next = setPath(old as unknown as Record<string, unknown>, path, value)
      if (path === 'mechanism') {
        next = setPath(
          next,
          'mechanism_options',
          value === 'rotating'
            ? { cycle: 'one_payout_per_member' }
            : value === 'random_draw'
              ? { draw_policy: 'without_replacement', algorithm: 'server_csprng' }
              : { target_minor: 0, distribute_at_end: true },
        )
        next = setPath(
          next,
          'distribution.rule',
          value === 'rotating'
            ? 'fixed_rotation'
            : value === 'random_draw'
              ? 'secure_random'
              : 'equal',
        )
      }
      if (path === 'basic.start_date') next = setPath(next, 'schedule.start_date', value)
      if (path === 'schedule.start_date') next = setPath(next, 'basic.start_date', value)
      if (
        path === 'contribution.member_count' &&
        typeof value === 'number' &&
        value >= 2 &&
        value <= 1000
      ) {
        next = setPath(next, 'membership.limit', value)
        next = setPath(
          next,
          'distribution.rotation_order',
          Array.from({ length: value }, (_, i) => i + 1),
        )
        if (old.mechanism !== 'pooled_savings')
          next = setPath(next, 'contribution.round_count', value)
      }
      if (path === 'rotation_order_input') {
        next = setPath(
          old as unknown as Record<string, unknown>,
          'distribution.rotation_order',
          String(value)
            .split(',')
            .filter((s) => s.trim() !== '')
            .map((s) => Number(s.trim())),
        )
      }
      return next as unknown as GroupConfig
    })
  }
  const design = (category: FieldDefinition['category'], fields: FieldDefinition[]) => {
    change('fields', [...c.fields.filter((f) => f.category !== category), ...fields])
    if (category === 'reward') {
      const allowed = new Set(fields.map((f) => f.key))
      change(
        'reward.custom_values',
        Object.fromEntries(Object.entries(c.reward.custom_values).filter(([k]) => allowed.has(k))),
      )
    }
  }
  const save = async () => {
    setError('')
    const parsed = draftSchema.safeParse(c)
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'))
      return
    }
    setBusy(true)
    try {
      const id = await saveRepaDraft(
        parsed.data,
        saved?.group.id ?? null,
        saved?.group.revision ?? 0,
        summary,
        effective ? new Date(effective).toISOString() : new Date().toISOString(),
      )
      const bundle = await getRepaGroup(id)
      setSaved(bundle)
      setC(bundle.configuration)
      setRotationInput(bundle.configuration.distribution.rotation_order.join(', '))
      setDirty(false)
      await cache.invalidateQueries({ queryKey: ['repa'] })
      toast.success('Rules snapshot saved. Previous versions and consents are preserved.')
      if (!initial) navigate(`/organizer/groups/${id}/edit`, { replace: true, state: { step } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }
  const validated = configSchema.safeParse(c)
  const issues = validated.success
    ? {}
    : Object.fromEntries(validated.error.issues.map((i) => [i.path.join('.'), i.message]))
  const values = {
    ...c,
    rotation_order_input: rotationInput,
  } as unknown as Record<string, unknown>
  const future = Boolean(saved?.group.accepted_version_id)
  return (
    <>
      <PageHeader
        title={
          future ? 'Propose a rules version' : initial ? 'Edit REPA draft' : 'Create REPA group'
        }
        description="Eight steps to a validated, versioned group configuration. Save an incomplete draft at any step."
        actions={
          saved && (
            <Link className="button button-secondary" to={`/organizer/groups/${saved.group.id}`}>
              Group details
            </Link>
          )
        }
      />
      <div className="repa-wizard-layout">
        <aside className="panel repa-step-nav">
          <nav aria-label="REPA wizard steps">
            {wizardSteps.map((title, i) => (
              <button
                type="button"
                key={title}
                aria-current={step === i ? 'step' : undefined}
                onClick={() => setStep(i)}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                {title}
              </button>
            ))}
          </nav>
          <small>Drafts do not create financial obligations.</small>
        </aside>
        <div className="repa-wizard-main">
          <section className="panel">
            <span className="eyebrow">STEP {step + 1} OF 8</span>
            <h2 className="component-spacing">{wizardSteps[step]}</h2>
            <p>
              {step === 1
                ? 'Each mechanism has its own validated rules. Secure random selection is configured without replacement; actual draw execution is outside this phase.'
                : step === 5
                  ? 'Rotating groups use fixed rotation; random-draw groups use secure selection; pooled savings supports equal, contribution-based and fixed-share allocation.'
                  : step === 4
                    ? 'Manual methods record instructions. An integrated gateway can be configured as a draft but cannot be activated in Phase 3.'
                    : 'Fields marked * are required for activation. Save drafts while you configure the remaining steps.'}
            </p>
            {step === 0 && (
              <label className="component-spacing">
                Organization
                <select
                  disabled={Boolean(saved)}
                  value={c.basic.organization_id}
                  onChange={(e) => change('basic.organization_id', e.target.value)}
                >
                  {access.organizations
                    .filter((o) => o.permissions.includes('groups.manage'))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <SchemaForm
              fields={stepFields[step]}
              values={values}
              onChange={change}
              groupId={saved?.group.id}
              errors={step === 7 ? issues : {}}
            />
            {(step === 2 || step === 6) && (
              <>
                <FieldDesigner
                  category={step === 2 ? 'reward' : 'membership'}
                  fields={c.fields.filter(
                    (f) => f.category === (step === 2 ? 'reward' : 'membership'),
                  )}
                  onChange={(fields) => design(step === 2 ? 'reward' : 'membership', fields)}
                />
                {step === 2 && (
                  <>
                    <h3 className="component-spacing">Custom reward values</h3>
                    <SchemaForm
                      fields={c.fields.filter((f) => f.category === 'reward')}
                      values={c.reward.custom_values}
                      onChange={(path, value) =>
                        change('reward.custom_values', setPath(c.reward.custom_values, path, value))
                      }
                      groupId={saved?.group.id}
                    />
                  </>
                )}
              </>
            )}
            {error && (
              <p className="error repa-terms" role="alert">
                {error}
              </p>
            )}
            <div className="actions component-spacing">
              <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
                Previous step
              </Button>
              {step < 7 && <Button onClick={() => setStep(step + 1)}>Next step</Button>}
              <Button variant="secondary" disabled={busy} onClick={() => void save()}>
                {busy ? 'Saving…' : 'Save draft'}
              </Button>
            </div>
          </section>
          {step === 7 && (
            <>
              <section className="panel component-spacing">
                <h2>Version record</h2>
                <label>
                  Change summary
                  <input
                    minLength={3}
                    maxLength={1000}
                    value={summary}
                    onChange={(e) => {
                      setSummary(e.target.value)
                      setDirty(true)
                    }}
                  />
                </label>
                {future && (
                  <label className="component-spacing">
                    Future effective date and time
                    <input
                      type="datetime-local"
                      value={effective}
                      onChange={(e) => {
                        setEffective(e.target.value)
                        setDirty(true)
                      }}
                    />
                  </label>
                )}
                <p>
                  Every saved version records who changed it, old and new values, approval status,
                  effective date, and separate member acceptance.
                </p>
              </section>
              <FundingReview configuration={c} />
              {saved ? (
                <>
                  <p className="component-spacing">
                    <Link
                      className="landing-text-link"
                      to={`/organizer/groups/${saved.group.id}#members`}
                    >
                      Manage members and exact-version agreements before activation →
                    </Link>
                  </p>
                  <ActivationPanel
                    key={saved.group.latest_version_id}
                    bundle={saved}
                    dirty={dirty}
                  />
                </>
              ) : (
                <p>Save the draft to run server validation and activate.</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
