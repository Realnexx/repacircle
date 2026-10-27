import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '@/modules/auth/session'
import { PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { LoadingSkeleton, ErrorState } from '@/components/feedback/states'
import { DataTable, StatusBadge } from '@/components/data-display/components'
import { getRepaGroup, repaFileUrl, transitionGroup, type RepaBundle } from './service'
import { transitions, type GroupStatus } from './config'
import { FundingReview, ActivationPanel } from './review'
import MembershipPanel from '@/modules/membership/panel'
import './styles.css'
export default function RepaDetail() {
  const { groupId } = useParams()
  const { session } = useSession()
  const query = useQuery({
    queryKey: ['repa', groupId],
    enabled: Boolean(session && groupId),
    queryFn: () => getRepaGroup(groupId!),
  })
  if (!session)
    return (
      <>
        <PageHeader title="REPA group" />
        <p>Sign in to view the group.</p>
      </>
    )
  if (query.isPending) return <LoadingSkeleton />
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
  return <GroupDetail bundle={query.data} />
}
function GroupDetail({ bundle }: { bundle: RepaBundle }) {
  const location = useLocation()
  const [tab, setTab] = useState(
    location.hash === '#members' ? 'Members & agreements' : 'Rules & funding',
  )
  const g = bundle.group
  const image = useQuery({
    queryKey: ['repa-image', g.image_path],
    enabled: Boolean(g.image_path),
    queryFn: () => repaFileUrl(g.image_path),
  })
  const c = bundle.accepted_configuration ?? bundle.configuration
  return (
    <>
      <PageHeader
        title={g.name || 'Untitled REPA'}
        description={g.description || 'Configuration-driven community savings group.'}
        eyebrow={g.mechanism.replaceAll('_', ' ').toUpperCase()}
        actions={
          <StatusBadge status={g.status === 'active' ? 'success' : 'neutral'}>
            {g.status.replaceAll('_', ' ')}
          </StatusBadge>
        }
      />
      {image.data && <img className="repa-cover" src={image.data} alt={g.name + ' group image'} />}
      <nav className="repa-tabs" aria-label="Group detail sections">
        {[
          'Rules & funding',
          'Members & agreements',
          'Schedule',
          'Settings',
          'Configuration history',
        ].map((item) => (
          <Button
            key={item}
            variant={tab === item ? 'primary' : 'secondary'}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
          </Button>
        ))}
      </nav>
      {g.accepted_version_id && (
        <p className="repa-lock-note">
          Accepted rules are locked to version{' '}
          {bundle.versions.find((v) => v.id === g.accepted_version_id)?.version_number}. Future
          proposals are tracked separately and do not rewrite accepted obligations.
        </p>
      )}
      {tab === 'Rules & funding' && (
        <>
          <FundingReview configuration={c} showSchedule={false} />
          <section className="panel component-spacing">
            <h2>Configured reward fields</h2>
            {c.fields.filter((f) => f.category === 'reward').length === 0 ? (
              <p>No custom reward fields.</p>
            ) : (
              <dl className="profile-details">
                {c.fields
                  .filter((f) => f.category === 'reward')
                  .map((f) => (
                    <div key={f.key}>
                      <dt>{f.label}</dt>
                      <dd>{JSON.stringify(c.reward.custom_values[f.key] ?? 'Not set')}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </section>
        </>
      )}
      {tab === 'Schedule' && <FundingReview configuration={c} />}
      {tab === 'Members & agreements' && <MembershipPanel bundle={bundle} />}
      {tab === 'Settings' && (
        <>
          {bundle.can_manage ? (
            <>
              <GroupSettings bundle={bundle} />
              <ActivationPanel key={g.latest_version_id} bundle={bundle} />
            </>
          ) : (
            <section className="panel">
              <p>Only authorized organizers may change group settings.</p>
            </section>
          )}
        </>
      )}
      {tab === 'Configuration history' && (
        <section className="panel">
          <h2>Rules versions</h2>
          <p>
            Snapshots and member consents are immutable. Each new save creates a new candidate and
            requires fresh acceptance.
          </p>
          {bundle.versions.map((v) => (
            <details className="repa-history" key={v.id}>
              <summary>
                Version {v.version_number} · {v.approval_status} · {v.change_summary}
              </summary>
              <dl className="profile-details">
                <dt>Changed by</dt>
                <dd>{v.changed_by}</dd>
                <dt>Effective date</dt>
                <dd>{new Date(v.effective_date).toLocaleString()}</dd>
                <dt>Member consents recorded</dt>
                <dd>{v.member_consent_count ?? 0}</dd>
                <dt>Approval</dt>
                <dd>{v.approved_by ?? 'Pending review'}</dd>
              </dl>
              <DataTable
                caption={`Version ${v.version_number} changes`}
                rows={v.changes}
                rowKey={(r) => r.path}
                columns={[
                  { key: 'field', header: 'Field', render: (r) => r.path.replaceAll('_', ' ') },
                  {
                    key: 'old',
                    header: 'Previous value',
                    render: (r) => <span className="repa-value">{JSON.stringify(r.previous)}</span>,
                  },
                  {
                    key: 'new',
                    header: 'New value',
                    render: (r) => <span className="repa-value">{JSON.stringify(r.next)}</span>,
                  },
                ]}
              />
            </details>
          ))}
          <h3 className="component-spacing">Recent server validation checks</h3>
          {bundle.checks.map((check) => (
            <details className="repa-history" key={check.id}>
              <summary>
                {new Date(check.checked_at).toLocaleString()} ·{' '}
                {check.result.valid ? 'Passed' : 'Blocked'}
              </summary>
              <ul>
                {check.result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
    </>
  )
}
function GroupSettings({ bundle }: { bundle: RepaBundle }) {
  const g = bundle.group
  const cache = useQueryClient()
  const allowed = transitions[g.status].filter((s) => s !== 'active' || g.status === 'paused')
  const [next, setNext] = useState<GroupStatus | ''>('')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const mutation = useMutation({
    mutationFn: () => transitionGroup(g.id, g.status, next as GroupStatus, reason),
    onSuccess: async () => {
      setNext('')
      setReason('')
      setConfirm(false)
      await cache.invalidateQueries({ queryKey: ['repa'] })
      toast.success('Group status updated.')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <section className="panel">
      <h2>Group settings</h2>
      <p>
        Updates are validated and audited. Active financial rules can only be proposed as a new
        future version.
      </p>
      {!['completed', 'cancelled', 'archived'].includes(g.status) && (
        <Link className="button button-secondary" to={`/organizer/groups/${g.id}/edit`}>
          {g.accepted_version_id ? 'Propose future rules' : 'Edit draft configuration'}
        </Link>
      )}
      {allowed.length > 0 && (
        <div className="component-spacing">
          <label>
            Next group status
            <select
              value={next}
              onChange={(e) => {
                setNext(e.target.value as GroupStatus)
                setConfirm(false)
              }}
            >
              <option value="">Select transition</option>
              {allowed.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="component-spacing">
            Reason
            <input
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {!confirm ? (
            <Button
              className="component-spacing"
              disabled={!next || reason.trim().length < 3}
              onClick={() => setConfirm(true)}
            >
              Review status change
            </Button>
          ) : (
            <div className="repa-confirm component-spacing" role="alert">
              <p>
                Change from {g.status.replaceAll('_', ' ')} to {next.replaceAll('_', ' ')}? Existing
                rules and agreements are retained.
              </p>
              <div className="actions">
                <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                  Confirm status change
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
