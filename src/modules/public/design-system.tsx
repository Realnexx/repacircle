import { useId, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import {
  CurrencyInput,
  DateTimePicker,
  FileUploader,
  FilterBar,
  FormField,
  SearchInput,
} from '@/components/forms/controls'
import {
  DataTable,
  Pagination,
  StatCard,
  StatusBadge,
  type Status,
} from '@/components/data-display/components'
const samples = [
  { id: '1', name: 'Community gathering', status: 'Draft' },
  { id: '2', name: 'Member orientation', status: 'Ready' },
  { id: '3', name: 'Organizer workshop', status: 'Draft' },
]
export default function DesignSystem() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [amount, setAmount] = useState('0')
  const [date, setDate] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [confirm, setConfirm] = useState(false)
  const [name, setName] = useState('')
  const id = useId()
  const rows = samples.filter(
    (row) =>
      row.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || row.status === filter),
  )
  return (
    <>
      <PageHeader
        title="Design system"
        description="An interactive reference for RepaCircle’s shared components. All content on this page is sample content."
        eyebrow="PHASE 1 · UI REFERENCE"
      />
      <div className="design-grid">
        <section className="panel">
          <h2>Color & status</h2>
          <div className="swatches">
            {['primary', 'secondary', 'success', 'warning', 'danger', 'neutral'].map((color) => (
              <div key={color}>
                <span style={{ background: `var(--${color})` }} />
                {color}
              </div>
            ))}
          </div>
          <div className="actions">
            {(['neutral', 'success', 'warning', 'danger', 'info'] as Status[]).map((status) => (
              <StatusBadge key={status} status={status}>
                {status}
              </StatusBadge>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Actions</h2>
          <div className="actions component-spacing">
            <Button onClick={() => toast.success('Sample action completed.')}>Primary</Button>
            <Button variant="secondary" onClick={() => toast.info('This is a sample toast.')}>
              Secondary
            </Button>
            <Button variant="ghost" onClick={() => toast('Sample feedback')}>
              Ghost
            </Button>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Confirm action
            </Button>
            <Button disabled>Disabled</Button>
          </div>
          <ConfirmDialog
            open={confirm}
            title="Confirm sample action?"
            description="This only demonstrates the confirmation pattern. No data is changed."
            onCancel={() => setConfirm(false)}
            onConfirm={() => {
              setConfirm(false)
              toast.success('Sample confirmation completed.')
            }}
          />
        </section>
        <section className="panel">
          <h2>Form controls</h2>
          <div className="component-spacing form-grid">
            <FormField
              id={`${id}-name`}
              label="Sample community name"
              hint="A descriptive name for your circle."
            >
              <input
                id={`${id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-describedby={`${id}-name-hint`}
              />
            </FormField>
            <FormField
              id={`${id}-currency`}
              label="Sample amount"
              hint="Stored as an exact centavo string; no transaction is made."
            >
              <CurrencyInput id={`${id}-currency`} value={amount} onChange={setAmount} />
            </FormField>
            <output>Centavos: {amount}</output>
            <FormField
              id={`${id}-date`}
              label="Sample date and time"
              hint="Local wall time. Business schedules will require an explicit timezone."
            >
              <DateTimePicker id={`${id}-date`} value={date} onChange={setDate} />
            </FormField>
            <FileUploader id={`${id}-file`} onFiles={setFiles} />
            <output aria-live="polite">{files.length} files selected locally</output>
          </div>
        </section>
        <section className="panel">
          <h2>Feedback</h2>
          <LoadingSkeleton rows={2} label="Sample loading state" />
          <EmptyState
            title="Sample empty state"
            description="Explain what belongs here and the next useful action."
          />
          <ErrorState
            title="Sample error state"
            message="An example of recoverable feedback."
            onRetry={() => toast.info('Sample retry requested.')}
          />
        </section>
      </div>
      <section className="panel component-spacing">
        <div className="section-heading">
          <h2>Sample data table</h2>
          <StatusBadge status="warning">Sample content</StatusBadge>
        </div>
        <FilterBar
          onReset={() => {
            setSearch('')
            setFilter('all')
            setPage(1)
          }}
        >
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            label="Search sample activities"
          />
          <label className="inline-label">
            Status
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="all">All statuses</option>
              <option>Draft</option>
              <option>Ready</option>
            </select>
          </label>
        </FilterBar>
        <DataTable
          caption="Sample activities — not live application data"
          rows={rows.slice((page - 1) * 2, page * 2)}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              header: 'Activity',
              render: (row) => row.name,
              sortValue: (row) => row.name,
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <StatusBadge status={row.status === 'Ready' ? 'success' : 'neutral'}>
                  {row.status}
                </StatusBadge>
              ),
            },
          ]}
        />
        <Pagination page={page} pageSize={2} total={rows.length} onPageChange={setPage} />
      </section>
      <div className="stat-grid component-spacing">
        <StatCard label="Sample statistic" value="—" description="No financial data is shown." />
        <StatCard
          label="Type scale"
          value="Aa"
          description="System fonts, readable sizes, consistent hierarchy."
        />
        <StatCard
          label="Spacing base"
          value="4px"
          description="Shared tokens for spacing, radius and shadows."
        />
      </div>
    </>
  )
}
