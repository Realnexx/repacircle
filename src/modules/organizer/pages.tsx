import { useSession } from '@/modules/auth/session'
import { WorkspacePage } from '../shared/workspace-page'
import {
  OrganizationMembersPage,
  OrganizationSettingsPage,
  OrganizationScopesPage,
} from '../organizations/workspace-pages'
export default function OrganizerPages(props: React.ComponentProps<typeof WorkspacePage>) {
  const { session } = useSession()
  if (session) {
    if (props.slug === 'members') return <OrganizationMembersPage />
    if (props.slug === 'settings') return <OrganizationSettingsPage />
    if (props.slug === 'groups') return <OrganizationScopesPage />
  }
  return <WorkspacePage {...props} />
}
