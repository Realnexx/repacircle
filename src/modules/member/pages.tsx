import { useSession } from '@/modules/auth/session'
import { WorkspacePage } from '../shared/workspace-page'
import { AssignedScopesPage } from '../organizations/workspace-pages'
import ContributionsPage from '../contributions/pages'
export default function MemberPages(props: React.ComponentProps<typeof WorkspacePage>) {
  const { session } = useSession()
  if (props.slug === 'my-contributions') return <ContributionsPage />
  return session && props.slug === 'my-groups' ? (
    <AssignedScopesPage treasurer={false} />
  ) : (
    <WorkspacePage {...props} />
  )
}
