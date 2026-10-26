import { useEffect, useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  Building2,
  LayoutDashboard,
  Menu,
  Users,
  Wallet,
  Settings,
  FileBarChart,
  ShieldCheck,
  X,
} from 'lucide-react'
import { workspaces } from '@/app/router/definitions'
import { useAccess } from '@/app/providers/access'
import { environment } from '@/lib/validation/env'
import type { WorkspaceRole } from '@/types/access'
import { Breadcrumbs } from './page'
import { NotificationDropdown, ThemeToggle, UserMenu } from './menus'
const icons = {
  dashboard: LayoutDashboard,
  groups: Users,
  members: Users,
  settings: Settings,
  reports: FileBarChart,
}
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="RepaCircle home">
      <span className="brand-icon" aria-hidden="true">
        ◎
      </span>
      RepaCircle<span className="brand-dot">.</span>
    </Link>
  )
}
function NavigationLinks({ role, onNavigate }: { role: WorkspaceRole; onNavigate?: () => void }) {
  const workspace = workspaces.find((w) => w.role === role)!
  return (
    <>
      <span className="nav-label">WORKSPACE</span>
      <nav className="workspace-nav" aria-label={`${workspace.label} navigation`}>
        {workspace.pages.map((page) => {
          const Icon = icons[page.slug as keyof typeof icons] ?? Wallet
          return (
            <NavLink key={page.slug} onClick={onNavigate} to={`/${role}/${page.slug}`}>
              <Icon size={18} aria-hidden="true" />
              {page.title}
            </NavLink>
          )
        })}
        {role === 'organizer' && (
          <NavLink to="/organizations" onClick={onNavigate}>
            <Building2 size={18} />
            Organizations
          </NavLink>
        )}
      </nav>
    </>
  )
}
export function WorkspaceSelector({ role }: { role: WorkspaceRole }) {
  const access = useAccess()
  return (
    <div className="workspace-selector">
      {environment.mode === 'setup' ? (
        <label>
          Preview workspace
          <select
            aria-label="Preview workspace"
            value={role}
            onChange={(e) => {
              window.location.assign(`/${e.target.value}/dashboard`)
            }}
          >
            {workspaces.map((w) => (
              <option key={w.role} value={w.role}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Organization
          <select
            aria-label="Current organization"
            value={access.organizationId ?? ''}
            onChange={(e) => access.selectOrganization(e.target.value)}
          >
            <option value="" disabled>
              Select an organization
            </option>
            {access.organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
export function AppSidebar({ role }: { role: WorkspaceRole }) {
  return (
    <aside className="sidebar">
      <Brand />
      <WorkspaceSelector role={role} />
      <NavigationLinks role={role} />
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <ShieldCheck size={20} />
          <p>
            A little from each.
            <br />
            More for everyone.
          </p>
        </div>
        <Link to="/help">Help & setup</Link>
      </div>
    </aside>
  )
}
export function MobileNavigation({
  role,
  open,
  onClose,
}: {
  role: WorkspaceRole
  open: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])
  return (
    <dialog
      className="mobile-navigation"
      ref={ref}
      aria-label="Workspace navigation"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="section-heading">
        <Brand />
        <button className="icon-button" aria-label="Close navigation" onClick={onClose}>
          <X />
        </button>
      </div>
      <WorkspaceSelector role={role} />
      <NavigationLinks role={role} onNavigate={onClose} />
      <Link to="/help" onClick={onClose}>
        Help & setup
      </Link>
    </dialog>
  )
}
export function AppHeader({
  role,
  title,
  onOpenNavigation,
}: {
  role: WorkspaceRole
  title: string
  onOpenNavigation: () => void
}) {
  return (
    <header className="app-header">
      <div className="header-left">
        <button
          className="icon-button mobile-menu"
          aria-label="Open navigation"
          onClick={onOpenNavigation}
        >
          <Menu />
        </button>
        <Breadcrumbs
          items={[
            { label: workspaces.find((w) => w.role === role)!.label, href: `/${role}/dashboard` },
            { label: title },
          ]}
        />
      </div>
      <div className="header-right">
        <ThemeToggle />
        <NotificationDropdown />
        <UserMenu />
      </div>
    </header>
  )
}
