import { useSession } from '@/modules/auth/session'
import { WorkspacePage } from '../shared/workspace-page'
import {
  PlatformAccounts,
  PlatformAnalytics,
  PlatformOrganizations,
  PlatformSettings,
} from './management'
export default function PlatformPages(props: React.ComponentProps<typeof WorkspacePage>) {
  const { session } = useSession()
  if (session) {
    if (props.slug === 'users') return <PlatformAccounts />
    if (props.slug === 'dashboard') return <PlatformAnalytics />
    if (props.slug === 'organizations') return <PlatformOrganizations />
    if (props.slug === 'settings') return <PlatformSettings />
  }
  return <WorkspacePage {...props} />
}
