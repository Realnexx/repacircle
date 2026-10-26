import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CircleHelp,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

export function WorkspaceShortcuts({ platform = false }: { platform?: boolean }) {
  const links = [
    {
      to: platform ? '/platform-admin/organizations' : '/organizations',
      icon: Building2,
      title: platform ? 'Organizations' : 'Your organizations',
      text: platform ? 'Review community workspaces' : 'Find your community',
    },
    {
      to: platform ? '/platform-admin/users' : '/profile',
      icon: UserRound,
      title: platform ? 'Account directory' : 'Personal information',
      text: platform ? 'Manage platform account access' : 'Keep your details up to date',
    },
    {
      to: '/security',
      icon: ShieldCheck,
      title: 'Account security',
      text: 'Manage your sign-in protection',
    },
    {
      to: '/help',
      icon: CircleHelp,
      title: 'Help & getting started',
      text: 'Make yourself at home',
    },
  ]
  return (
    <aside className="panel dashboard-shortcuts">
      <div className="section-heading">
        <h2>Your workspace</h2>
        <ArrowUpRight size={18} aria-hidden="true" />
      </div>
      <p>A few essentials, always within reach.</p>
      <nav aria-label="Workspace essentials">
        {links.map(({ to, icon: Icon, title, text }) => (
          <Link to={to} key={to}>
            <span className="shortcut-icon">
              <Icon size={18} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </aside>
  )
}
