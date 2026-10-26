import { Building2 } from 'lucide-react'
export default function Setup() {
  return (
    <section className="setup-panel">
      <div className="setup-icon">
        <Building2 size={25} />
      </div>
      <div>
        <span className="eyebrow">LET’S LAY THE FOUNDATION</span>
        <h2>Your community’s next chapter.</h2>
        <p>
          Connect your Supabase project to enable secure accounts and create your first
          organization.
        </p>
        <ol>
          <li>
            Copy <code>.env.example</code> to <code>.env</code>.
          </li>
          <li>Add your Supabase URL and publishable key.</li>
          <li>Apply the database migration and restart the app.</li>
        </ol>
        <span className="small muted">See README.md for setup and security verification.</span>
      </div>
    </section>
  )
}
