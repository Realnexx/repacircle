import { useSession } from '@/modules/auth/session'
import { WorkspacePage } from '../shared/workspace-page'
import { AssignedScopesPage } from '../organizations/workspace-pages'
import ContributionsPage from '../contributions/pages'
export default function TreasurerPages(props: React.ComponentProps<typeof WorkspacePage>) {
  const { session } = useSession()
  if (props.slug === 'collections') return <ContributionsPage />
  return session && props.slug === 'assigned-groups' ? (
    <AssignedScopesPage treasurer />
  ) : (
    <WorkspacePage {...props} />
  )
}
