import { Link } from 'react-router-dom'
import { ArrowUpRight, ShieldCheck, Users, Wallet, HandCoins } from 'lucide-react'
import { WorkspaceShortcuts } from '@/components/layout/workspace-shortcuts'
import { PageHeader } from '@/components/layout/page'
import { EmptyState } from '@/components/feedback/states'
import { StatCard, StatusBadge } from '@/components/data-display/components'
import { useSession } from '@/modules/auth/session'
import { ActivityChart } from '@/components/data-display/activity-chart'
import type { WorkspaceRole } from '@/types/access'
import { useEntrance } from '@/hooks/use-entrance'
export function WorkspacePage({
  role,
  slug,
  title,
  description,
}: {
  role: WorkspaceRole
  slug: string
  title: string
  description: string
}) {
  const { session } = useSession()
  const ref = useEntrance()
  return (
    <div ref={ref}>
      <PageHeader
        title={title}
        description={description}
        eyebrow={role.replace('-', ' ').toUpperCase()}
      />
      {slug === 'dashboard' ? (
        <>
          <div className="dashboard-overview">
            <div className="dashboard-overview-main">
              <div className="dashboard-welcome panel">
                <div>
                  <StatusBadge status="info">REPA configuration</StatusBadge>
                  <h2>Your community, thoughtfully connected.</h2>
                  <p>
                    Configure your community’s REPA groups, review funding assumptions and agree on
                    clear rules before activation.
                  </p>
                  <Link
                    className="button"
                    to={role === 'organizer' ? '/organizer/groups' : '/help'}
                  >
                    {role === 'organizer' ? 'Manage REPA groups' : 'View setup guide'}
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
                <div className="dashboard-symbol" aria-hidden="true">
                  <Users size={44} />
                </div>
              </div>
              <div className="stat-grid">
                <StatCard
                  label="Groups"
                  value="—"
                  description="Group data is not connected."
                  icon={<Users size={18} />}
                />
                <StatCard
                  label="Contributions"
                  value="—"
                  description="No financial data loaded."
                  icon={<Wallet size={18} />}
                />
                <StatCard
                  label="Payouts"
                  value="—"
                  description="No financial data loaded."
                  icon={<HandCoins size={18} />}
                />
              </div>
            </div>
            <WorkspaceShortcuts platform={role === 'platform-admin'} />
          </div>
          <div className="dashboard-lower">
            <section className="panel dashboard-activity">
              <div className="section-heading">
                <h2>Community activity</h2>
                <StatusBadge>Awaiting activity</StatusBadge>
              </div>
              <ActivityChart data={[]} />
            </section>
            <aside className="panel circle-note">
              <span className="eyebrow">THE POWER OF YOUR CIRCLE</span>
              <div className="circle-note-symbol" aria-hidden="true">
                <ShieldCheck size={30} />
              </div>
              <h2>
                Built for community.
                <br />
                Designed for trust.
              </h2>
              <p>
                A shared purpose starts with a clear foundation. Bring your community together, one
                step at a time.
              </p>
              <Link to="/help">
                Explore the setup guide <ArrowUpRight size={16} />
              </Link>
            </aside>
          </div>
        </>
      ) : slug === 'profile' ? (
        <section className="panel">
          <h2>Account details</h2>
          <dl className="profile-details">
            <dt>Email</dt>
            <dd>{session?.user.email ?? 'Unavailable in layout preview'}</dd>
            <dt>Profile editing</dt>
            <dd>Will be enabled in the account management phase.</dd>
          </dl>
        </section>
      ) : (
        <section className="panel">
          <StatusBadge>Not connected yet</StatusBadge>
          <EmptyState
            title={`${title} will appear here`}
            description="This page is a functional navigation shell. Its data and actions will be implemented in the corresponding phase."
          />
        </section>
      )}
    </div>
  )
}
