import { useId, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '@/modules/auth/session'
import { useAccess } from '@/app/providers/access'
import { PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { DataTable, Pagination, StatusBadge } from '@/components/data-display/components'
import { EmptyState, LoadingSkeleton, ErrorState } from '@/components/feedback/states'
import { SchemaForm } from '@/modules/repa/schema-form'
import { parseCentavos } from '@/lib/utils/currency'
import { exactMoney } from '@/modules/rewards/config'
import { obligationStatuses, feeDescription, scheduleDescription } from './engine'
import {
  contributionGroups,
  contributionWorkspace,
  contributionDetail,
  recordReceipt,
  adjustObligation,
  refreshDeadlines,
  dismissReminder,
  type ContributionWorkspace,
  type Obligation,
} from './service'
import './styles.css'
const statusColor = (s: string) =>
  s === 'paid' || s === 'ready'
    ? 'success'
    : s === 'overdue'
      ? 'danger'
      : s === 'partially_paid'
        ? 'warning'
        : 'neutral'
const dateText = (d: string, tz: string) =>
  new Date(d).toLocaleString('en-PH', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' })
export default function ContributionsPage({ embeddedGroup }: { embeddedGroup?: string }) {
  const { session } = useSession()
  const access = useAccess()
  const [params, setParams] = useSearchParams()
  const groups = useQuery({
    queryKey: ['contribution-groups', access.organizationId],
    enabled: Boolean(session && access.organizationId && !embeddedGroup),
    queryFn: () => contributionGroups(access.organizationId!),
  })
  const selected =
    embeddedGroup ??
    (groups.data?.some((g) => g.id === params.get('group'))
      ? params.get('group')!
      : groups.data?.[0]?.id)
  return (
    <>
      {!embeddedGroup && (
        <PageHeader
          title="Contributions & deadlines"
          eyebrow="CONTRIBUTION ENGINE"
          description="Accepted obligations, verified receipts, deadlines and collection progress."
        />
      )}
      {!session ? (
        <EmptyState description="Sign in to view your authorized contribution obligations." />
      ) : !access.organizationId ? (
        <EmptyState description="Choose an organization to view contributions." />
      ) : !embeddedGroup && groups.isError ? (
        <ErrorState message={groups.error.message} onRetry={() => void groups.refetch()} />
      ) : !embeddedGroup && groups.isPending ? (
        <LoadingSkeleton />
      ) : !selected ? (
        <EmptyState
          title="No accepted contribution schedules"
          description="Obligations are generated when a REPA group activates with accepted rules. Draft proposals do not create debts."
        />
      ) : (
        <>
          {!embeddedGroup && (
            <section className="panel">
              <label>
                Contribution group
                <select value={selected} onChange={(e) => setParams({ group: e.target.value })}>
                  {groups.data?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} · {g.status}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}
          <ContributionBoard key={selected} groupId={selected} />
        </>
      )}
    </>
  )
}
function ContributionBoard({ groupId }: { groupId: string }) {
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detail, setDetail] = useState<Obligation | null>(null)
  const [receipt, setReceipt] = useState<Obligation | null>(null)
  const [adjust, setAdjust] = useState<Obligation | null>(null)
  const [round, setRound] = useState<number | null>(null)
  const cache = useQueryClient()
  const query = useQuery({
    queryKey: ['contributions', groupId, status, page, from, to],
    queryFn: () => contributionWorkspace(groupId, status, page, from, to),
    refetchInterval: 30000,
  })
  const refresh = useMutation({
    mutationFn: () => refreshDeadlines(groupId),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['contributions'] })
      toast.success('Deadline checks completed. Duplicate jobs are skipped.')
    },
    onError: (e) => toast.error(e.message),
  })
  const dismiss = useMutation({
    mutationFn: dismissReminder,
    onSuccess: () => cache.invalidateQueries({ queryKey: ['contributions'] }),
    onError: (e) => toast.error(e.message),
  })
  if (query.isPending) return <LoadingSkeleton />
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => {
          if (from && to && from > to) {
            setFrom('')
            setTo('')
            setPage(1)
          } else void query.refetch()
        }}
      />
    )
  const b = query.data,
    c = b.group.currency,
    tz = b.group.timezone,
    reset = () => setPage(1)
  return (
    <>
      <section className="panel component-spacing">
        <div className="section-heading">
          <div>
            <h2>
              {b.can_collect ? 'Organizer collection dashboard' : 'Your contribution obligations'}
            </h2>
            <p>
              {b.group.name} · {tz} · {scheduleDescription(b.configuration.schedule)}
            </p>
          </div>
          {b.can_collect && (
            <Button
              variant="secondary"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              Run deadline checks
            </Button>
          )}
        </div>
        <p>
          Only verified receipts reduce balances. Pending payment attempts do not change an
          obligation’s status. Amounts and deadlines stay attached to their accepted rules version.
        </p>
        <div className="contribution-stats">
          {[
            ['Amount due', exactMoney(b.summary.due_minor, c)],
            ['Amount verified', exactMoney(b.summary.verified_minor, c)],
            ['Remaining balance', exactMoney(b.summary.remaining_minor, c)],
            ['Overdue obligations', b.summary.overdue],
            ['Paid obligations', `${b.summary.paid} / ${b.summary.obligations}`],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {b.engine && (
          <p>
            Collection round {b.engine.current_round} ·{' '}
            {b.engine.cycle_ready
              ? 'All contribution rounds are ready'
              : 'Collection checks in progress'}{' '}
            · Last checked {dateText(b.engine.last_checked_at, tz)}. Readiness does not execute
            payouts or complete the REPA group.
          </p>
        )}
        <p>
          {b.configuration.contribution.late_policy === 'fee'
            ? feeDescription(b.configuration.contribution.late_fee_rule)
            : `Late payment policy: ${b.configuration.contribution.late_policy}.`}{' '}
          Pausing or suspending participation does not erase an obligation or extend its deadline.
        </p>
      </section>
      {b.reminders.length > 0 && (
        <section className="panel component-spacing">
          <h2>Deadline reminders</h2>
          {b.reminders.map((r) => (
            <div className="contribution-reminder" key={r.id}>
              <p>
                {r.kind.replaceAll('_', ' ')} · {dateText(r.deadline_at, tz)}
              </p>
              <Button
                variant="ghost"
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate(r.id)}
              >
                Dismiss reminder
              </Button>
            </div>
          ))}
        </section>
      )}
      <Calendar groupId={groupId} />
      <section className="panel component-spacing">
        <h2>Member obligation table</h2>
        <div className="reward-filter">
          <label>
            Obligation status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                reset()
              }}
            >
              <option value="all">All statuses</option>
              {obligationStatuses.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Due from
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                reset()
              }}
            />
          </label>
          <label>
            Due through
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                reset()
              }}
            />
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('')
              setTo('')
              setStatus('all')
              reset()
            }}
          >
            Clear obligation filters
          </Button>
        </div>
        <DataTable
          caption="Contribution obligations"
          rows={b.obligations}
          rowKey={(o) => o.id}
          columns={[
            {
              key: 'member',
              header: 'Member / round',
              render: (o) => (
                <>
                  {o.member_name}
                  <small className="reward-subtitle">
                    Round {o.round} · Slot {o.member_slot}
                  </small>
                </>
              ),
            },
            {
              key: 'due',
              header: 'Deadline',
              render: (o) => (
                <>
                  {dateText(o.due_at, tz)}
                  <small className="reward-subtitle">
                    Grace ends {dateText(o.grace_ends_at, tz)}
                  </small>
                </>
              ),
            },
            {
              key: 'amount',
              header: 'Verified / due',
              render: (o) => (
                <>
                  {exactMoney(o.verified_minor, c)} / {exactMoney(o.due_minor, c)}
                  <progress
                    className="contribution-progress"
                    aria-label={`${o.member_name}, round ${o.round} payment progress`}
                    max={Math.max(1, o.due_minor)}
                    value={o.verified_minor}
                  />
                  <small>{exactMoney(o.remaining_minor, c)} remaining</small>
                </>
              ),
            },
            {
              key: 'status',
              header: 'Obligation status',
              render: (o) => (
                <StatusBadge status={statusColor(o.status)}>
                  {o.status.replaceAll('_', ' ')}
                </StatusBadge>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              render: (o) => (
                <div className="actions">
                  <Button variant="ghost" onClick={() => setDetail(o)}>
                    History
                  </Button>
                  {b.can_record && o.remaining_minor > 0 && (
                    <Button variant="secondary" onClick={() => setReceipt(o)}>
                      Record verified receipt
                    </Button>
                  )}
                  {b.can_adjust && o.remaining_minor > 0 && (
                    <Button variant="ghost" onClick={() => setAdjust(o)}>
                      Adjust deadline or waiver
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pagination page={page} pageSize={25} total={b.total} onPageChange={setPage} />
      </section>
      <section className="panel component-spacing">
        <h2>Upcoming deadlines & overdue contributions</h2>
        <p>
          These lists reflect the current filters and table page. Choose a status filter above to
          see every matching obligation.
        </p>
        <div className="contribution-deadline-grid">
          {[
            {
              title: 'Upcoming and unpaid',
              rows: b.obligations.filter((o) =>
                ['upcoming', 'unpaid', 'partially_paid'].includes(o.status),
              ),
            },
            { title: 'Overdue', rows: b.obligations.filter((o) => o.status === 'overdue') },
          ].map((section) => (
            <div key={section.title}>
              <h3>{section.title}</h3>
              {section.rows.length ? (
                section.rows.map((o) => (
                  <button className="contribution-deadline" key={o.id} onClick={() => setDetail(o)}>
                    <strong>
                      {o.member_name} · Round {o.round}
                    </strong>
                    <span>{dateText(o.due_at, tz)}</span>
                    <span>{exactMoney(o.remaining_minor, c)}</span>
                  </button>
                ))
              ) : (
                <p>No matching obligations on this page.</p>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="panel component-spacing">
        <h2>{b.can_collect ? 'Group round details' : 'Your round details'}</h2>
        <p>
          Collection readiness requires verified principal, settled balances and complete member
          obligations. Waived principal can leave a funding gap. Round progression also waits for
          grace expiry and earlier rounds. Payment and reward execution are separate.
        </p>
        <DataTable
          caption="Contribution round progress"
          rows={b.rounds}
          rowKey={(r) => String(r.round_number)}
          columns={[
            {
              key: 'round',
              header: 'Round',
              render: (r) => (
                <Button variant="ghost" onClick={() => setRound(r.round_number)}>
                  Round {r.round_number}
                </Button>
              ),
            },
            {
              key: 'status',
              header: 'Collection status',
              render: (r) => (
                <StatusBadge status={statusColor(r.status)}>
                  {r.status.replaceAll('_', ' ')}
                </StatusBadge>
              ),
            },
            {
              key: 'verified',
              header: 'Verified principal',
              render: (r) => exactMoney(r.verified_minor, c),
            },
            {
              key: 'remaining',
              header: 'Outstanding',
              render: (r) => exactMoney(r.outstanding_minor, c),
            },
            {
              key: 'ready',
              header: 'Readiness',
              render: (r) =>
                r.can_progress
                  ? 'Ready for progression'
                  : r.collection_ready
                    ? 'Collected; waiting for round checks'
                    : 'Collection required',
            },
          ]}
        />
        {b.can_collect && (
          <details className="component-spacing">
            <summary>Scheduled engine checks</summary>
            {b.last_job_runs.map((j) => (
              <p key={j.job_kind}>
                {j.job_kind.replaceAll('_', ' ')} ·{' '}
                {j.completed_at ? dateText(j.completed_at, tz) : 'Not yet run'}
              </p>
            ))}
            <p>
              A private database job runs every minute when pg_cron is available. Reminders are
              scheduled in-app; this phase does not send external email or SMS.
            </p>
          </details>
        )}
      </section>
      {detail && <HistoryDialog obligation={detail} onClose={() => setDetail(null)} />}
      {receipt && (
        <ReceiptDialog obligation={receipt} workspace={b} onClose={() => setReceipt(null)} />
      )}
      {adjust && <AdjustmentDialog obligation={adjust} onClose={() => setAdjust(null)} />}
      {round !== null && (
        <RoundDialog workspace={b} number={round} onClose={() => setRound(null)} />
      )}
    </>
  )
}
function Calendar({ groupId }: { groupId: string }) {
  const [month, setMonth] = useState(() =>
    (() => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(new Date())
      return (
        parts.find((p) => p.type === 'year')!.value +
        '-' +
        parts.find((p) => p.type === 'month')!.value
      )
    })(),
  )
  // Use a canonical month independently of locale ordering.
  const value = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7),
    first = value + '-01',
    last = new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0).getDate(),
    end = `${value}-${String(last).padStart(2, '0')}`
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ['contributions', 'calendar', groupId, first, end, page],
    queryFn: () => contributionWorkspace(groupId, 'all', page, first, end),
    refetchInterval: 30000,
  })
  const offset = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7
  return (
    <section className="panel component-spacing">
      <div className="section-heading">
        <h2>Contribution calendar</h2>
        <label>
          Calendar month
          <input
            type="month"
            value={value}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value)
                setPage(1)
              }
            }}
          />
        </label>
      </div>
      {q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <LoadingSkeleton />
      ) : (
        <>
          <p>
            {q.data.group.timezone} · Calendar page {page}: {q.data.obligations.length} of{' '}
            {q.data.total} obligations this month.
          </p>
          <div
            className="contribution-calendar"
            role="list"
            aria-label="Contribution calendar dates"
          >
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <span className="calendar-weekday" aria-hidden="true" key={day}>
                {day}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span aria-hidden="true" key={'blank' + i} />
            ))}
            {Array.from({ length: last }, (_, i) => {
              const date = `${value}-${String(i + 1).padStart(2, '0')}`,
                rows = q.data.obligations.filter((o) => o.local_due_date === date)
              return (
                <div
                  className={
                    rows.some((o) => o.status === 'overdue')
                      ? 'calendar-day calendar-overdue'
                      : 'calendar-day'
                  }
                  role="listitem"
                  key={date}
                >
                  <strong>{i + 1}</strong>
                  {rows.length > 0 && (
                    <span>
                      {rows.length} due
                      <small>{rows.filter((o) => o.status === 'paid').length} paid</small>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <Pagination page={page} pageSize={25} total={q.data.total} onPageChange={setPage} />
        </>
      )}
    </section>
  )
}
function HistoryDialog({
  obligation: o,
  onClose,
}: {
  obligation: Obligation
  onClose: () => void
}) {
  const title = useId()
  const q = useQuery({
    queryKey: ['contribution-detail', o.id],
    queryFn: () => contributionDetail(o.id),
    refetchInterval: 30000,
  })
  return (
    <Modal labelledBy={title} onClose={onClose} busy={false} className="contribution-dialog">
      <h2 id={title}>Contribution history · Round {o.round}</h2>
      {q.isPending ? (
        <LoadingSkeleton />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <p>
            Accepted rules {q.data.obligation.rules_version_id}. Original deadline{' '}
            {dateText(q.data.obligation.original_due_at, o.timezone)}. Current deadline{' '}
            {dateText(q.data.obligation.due_at, o.timezone)}.
          </p>
          <p>
            {exactMoney(q.data.obligation.verified_minor, o.currency)} verified ·{' '}
            {exactMoney(q.data.obligation.remaining_minor, o.currency)} remaining ·{' '}
            {q.data.obligation.status.replaceAll('_', ' ')}.
          </p>
          <DataTable
            caption="Verified contribution history"
            rows={q.data.payments}
            rowKey={(p) => p.id}
            columns={[
              {
                key: 'method',
                header: 'Method / reference',
                render: (p) => (
                  <>
                    {p.payment_method.replaceAll('_', ' ')}
                    <small className="reward-subtitle">{p.external_reference}</small>
                  </>
                ),
              },
              {
                key: 'principal',
                header: 'Principal',
                render: (p) => exactMoney(p.principal_minor, o.currency),
              },
              { key: 'fee', header: 'Fee', render: (p) => exactMoney(p.fee_minor, o.currency) },
              {
                key: 'date',
                header: 'Verified',
                render: (p) => dateText(p.verified_at, o.timezone),
              },
              { key: 'note', header: 'Evidence', render: (p) => p.evidence_note },
            ]}
          />
          <h3>Fee and deadline history</h3>
          {q.data.adjustments.map((a) => (
            <p key={a.id}>
              {a.kind.replaceAll('_', ' ')} · {exactMoney(a.amount_minor, o.currency)}
              {a.extended_due_at ? ` · ${dateText(a.extended_due_at, o.timezone)}` : ''} ·{' '}
              {a.reason}
            </p>
          ))}
          {!q.data.adjustments.length && <p>No adjustments.</p>}
          <h3>Detected status transitions</h3>
          {q.data.status_history.map((e) => (
            <p key={e.id}>
              {e.previous_status ?? 'generated'} → {e.new_status} ·{' '}
              {dateText(e.detected_at, o.timezone)}
            </p>
          ))}
        </>
      )}
      <Button className="component-spacing" onClick={onClose}>
        Close history
      </Button>
    </Modal>
  )
}
function ReceiptDialog({
  obligation: o,
  workspace: b,
  onClose,
}: {
  obligation: Obligation
  workspace: ContributionWorkspace
  onClose: () => void
}) {
  const title = useId(),
    cache = useQueryClient()
  const [amount, setAmount] = useState(o.remaining_minor)
  const [method, setMethod] = useState(b.configuration.payment.methods[0] ?? 'cash')
  const [reference, setReference] = useState('')
  const [evidence, setEvidence] = useState('')
  const [request] = useState(() => crypto.randomUUID())
  const m = useMutation({
    mutationFn: () => recordReceipt(o.id, amount, method, reference, evidence, request),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['contributions'] })
      await cache.invalidateQueries({ queryKey: ['contribution-detail', o.id] })
      await cache.invalidateQueries({ queryKey: ['membership'] })
      toast.success('Verified receipt recorded. Obligation balance updated.')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Modal labelledBy={title} busy={m.isPending} onClose={onClose}>
      <h2 id={title}>Record verified contribution</h2>
      <p>
        {o.member_name} · Round {o.round} · {exactMoney(o.remaining_minor, o.currency)} remaining.
        Record an already verified payment with supporting evidence. This form does not initiate a
        transfer.
      </p>
      <p>
        Partial contributions {o.partial_payments ? 'enabled' : 'disabled'} in the accepted version.
        Allocation settles principal before any unpaid fee.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          m.mutate()
        }}
      >
        <fieldset className="reward-editor-fieldset" disabled={m.isPending}>
          <SchemaForm
            fields={[
              {
                key: 'amount',
                label: 'Verified amount',
                type: 'currency',
                required: true,
                min: 1,
                max: 2e9,
              },
            ]}
            values={{ amount }}
            onChange={(_, v) => setAmount(v as number)}
          />
          <label>
            Verified payment method
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              {b.configuration.payment.methods.map((p) => (
                <option key={p} value={p}>
                  {p.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment reference
            <input
              required
              minLength={3}
              maxLength={200}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label>
            Verification evidence
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <div className="actions component-spacing">
            <Button type="submit" disabled={!Number.isInteger(amount) || amount <= 0}>
              Save verified receipt
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
function AdjustmentDialog({
  obligation: o,
  onClose,
}: {
  obligation: Obligation
  onClose: () => void
}) {
  const title = useId(),
    cache = useQueryClient()
  const [kind, setKind] = useState('extension')
  const [amount, setAmount] = useState('')
  const [extension, setExtension] = useState('')
  const [reason, setReason] = useState('')
  const [request] = useState(() => crypto.randomUUID())
  const m = useMutation({
    mutationFn: () => {
      const cents = kind === 'fee_waiver' ? parseCentavos(amount) : '0'
      if (cents === null) throw new Error('Enter a valid fee amount.')
      const at =
        kind === 'extension'
          ? new Date(extension + (o.timezone === 'UTC' ? 'Z' : '+08:00')).toISOString()
          : null
      return adjustObligation(o.id, kind, Number(cents), at, reason, request)
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['contributions'] })
      await cache.invalidateQueries({ queryKey: ['contribution-detail', o.id] })
      await cache.invalidateQueries({ queryKey: ['membership'] })
      toast.success('Contribution adjustment recorded with its history.')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Modal labelledBy={title} busy={m.isPending} onClose={onClose}>
      <h2 id={title}>Deadline or waiver adjustment</h2>
      <p>
        Changes append an audit record. Existing payment records and original deadlines are
        preserved. An extension keeps already assessed fees; waive unpaid fees separately.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          m.mutate()
        }}
      >
        <fieldset className="reward-editor-fieldset" disabled={m.isPending}>
          <label>
            Adjustment type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="extension">Payment extension</option>
              <option value="fee_waiver">Manual fee waiver</option>
              <option value="waiver">Waive unpaid obligation</option>
              <option value="cancellation">Cancel future obligation in cancelled group</option>
            </select>
          </label>
          {kind === 'extension' && (
            <label>
              Extended payment deadline ({o.timezone})
              <input
                type="datetime-local"
                required
                value={extension}
                onChange={(e) => setExtension(e.target.value)}
              />
            </label>
          )}
          {kind === 'fee_waiver' && (
            <label>
              Unpaid fee amount to waive
              <input
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          )}
          <label>
            Adjustment explanation
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p>
            Full waivers require zero verified payments and no unpaid fees. Cancellation is limited
            to future unpaid obligations of cancelled groups. Waived principal can leave a group
            funding gap.
          </p>
          <div className="actions">
            <Button type="submit">Record adjustment</Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
function RoundDialog({
  workspace: b,
  number,
  onClose,
}: {
  workspace: ContributionWorkspace
  number: number
  onClose: () => void
}) {
  const title = useId(),
    r = b.rounds.find((r) => r.round_number === number)
  return (
    <Modal labelledBy={title} busy={false} onClose={onClose}>
      <h2 id={title}>Round {number} collection details</h2>
      {r && (
        <>
          <p>
            {r.status.replaceAll('_', ' ')} · {b.group.timezone}
          </p>
          <dl className="profile-details">
            <dt>Expected principal</dt>
            <dd>{exactMoney(r.expected_minor, b.group.currency)}</dd>
            <dt>Verified principal</dt>
            <dd>{exactMoney(r.verified_minor, b.group.currency)}</dd>
            <dt>Remaining obligations and fees</dt>
            <dd>{exactMoney(r.outstanding_minor, b.group.currency)}</dd>
            {r.funding_gap_minor !== undefined && (
              <>
                <dt>Principal collection gap</dt>
                <dd>{exactMoney(r.funding_gap_minor, b.group.currency)}</dd>
              </>
            )}
            <dt>Grace ends</dt>
            <dd>{dateText(r.grace_ends_at, b.group.timezone)}</dd>
          </dl>
          <p>
            {r.can_progress
              ? 'Contribution checks allow this round to progress. Reward execution requires separate checks.'
              : 'The round is waiting for collections, its deadline, or earlier rounds.'}
          </p>
        </>
      )}
      <Button onClick={onClose}>Close round details</Button>
    </Modal>
  )
}
