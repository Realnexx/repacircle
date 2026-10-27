import { useSession } from '@/modules/auth/session'
import RepaList from '../repa/pages'
import RewardCatalog from '../rewards/pages'
import ContributionsPage from '../contributions/pages'
import { WorkspacePage } from '../shared/workspace-page'
import { OrganizationMembersPage, OrganizationSettingsPage } from '../organizations/workspace-pages'
export default function OrganizerPages(props: React.ComponentProps<typeof WorkspacePage>) {
  const { session } = useSession()
  if (props.slug === 'groups') return <RepaList />
  if (props.slug === 'rewards') return <RewardCatalog />
  if (props.slug === 'contributions') return <ContributionsPage />
  if (session) {
    if (props.slug === 'members') return <OrganizationMembersPage />
    if (props.slug === 'settings') return <OrganizationSettingsPage />
  }
  return <WorkspacePage {...props} />
}
