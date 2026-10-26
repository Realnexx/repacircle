import { useLocation } from 'react-router-dom'
import { PageHeader } from '@/components/layout/page'
import { StatusBadge } from '@/components/data-display/components'
export default function Legal() {
  const privacy = useLocation().pathname === '/privacy'
  return (
    <article className="legal-page">
      <PageHeader
        title={privacy ? 'Privacy Policy' : 'Terms and Conditions'}
        description="Draft for product review — not a finalized legal policy."
      />
      <StatusBadge status="warning">Draft · Phase 1</StatusBadge>
      <section className="panel">
        <h2>{privacy ? 'How the foundation handles information' : 'About RepaCircle'}</h2>
        <p>
          {privacy
            ? 'When connected, RepaCircle uses Supabase Authentication for account credentials and PostgreSQL for organization membership and audit records. Organization data is restricted by database access policies. No payment evidence or financial transactions are collected by this phase.'
            : 'RepaCircle is being developed to support community savings groups. This foundation provides account access and organization setup. Payment processing, fund custody and distribution are not available in this phase.'}
        </p>
        <h2>{privacy ? 'Access and choices' : 'Community responsibilities'}</h2>
        <p>
          {privacy
            ? 'Only use a project you control for testing. Data retention, deletion requests, controller identity, contact information and third-party disclosures must be finalized before production launch.'
            : 'Organizers and members will need clear, agreed group rules before operating a savings circle. Group agreements, dispute processes, service eligibility and operator contact details must be finalized before launch.'}
        </p>
        <h2>Before launch</h2>
        <p>
          These drafts must be reviewed and completed by the operator. Do not treat them as a
          published production policy.
        </p>
      </section>
    </article>
  )
}
