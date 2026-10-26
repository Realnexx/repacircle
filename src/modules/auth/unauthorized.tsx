import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/page'
export default function Unauthorized({ reason }: { reason?: string }) {
  return (
    <section className="panel">
      <PageHeader
        title="Access not permitted"
        description={
          reason ?? 'Your current organization or group assignment does not grant this permission.'
        }
      />
      <p>Switch to an authorized organization or ask its owner to review your assignments.</p>
      <div className="actions">
        <Link className="button" to="/organizations">
          Your organizations
        </Link>
        <Link className="button button-secondary" to="/profile">
          Your profile
        </Link>
      </div>
    </section>
  )
}
