import { useSession } from '@/modules/auth/session'
import { WorkspacePage } from '../shared/workspace-page'
import { AssignedScopesPage } from '../organizations/workspace-pages'
export default function MemberPages(props: React.ComponentProps<typeof WorkspacePage>) {
  const { session } = useSession()
  return session && props.slug === 'my-groups' ? (
    <AssignedScopesPage treasurer={false} />
  ) : (
    <WorkspacePage {...props} />
  )
}
