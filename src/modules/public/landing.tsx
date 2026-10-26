import { NavLink } from 'react-router-dom'
import {
  ArrowUpRight,
  Building2,
  Users,
  Wallet,
  ShieldCheck,
  ChevronRight,
  Check,
} from 'lucide-react'
export default function Landing() {
  return (
    <>
      <div className="welcome">
        <div>
          <span className="eyebrow">A STRONGER COMMUNITY, TOGETHER</span>
          <h1>
            Small contributions.
            <br />
            <span>Shared possibilities.</span>
          </h1>
          <p>
            Bring your circle together with a clear, trusted
            <br className="desktop" /> foundation for community savings.
          </p>
          <NavLink className="button" to="/organizations">
            Set up your community <ArrowUpRight size={17} />
          </NavLink>
        </div>
        <div className="circle-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="circle-core">
            <Users size={44} />
          </div>
          <span className="art-chip chip-top">
            <ShieldCheck size={17} /> Built on trust
          </span>
          <span className="art-chip chip-bottom">
            <span className="green-dot" /> Better, together
          </span>
        </div>
      </div>
      <div className="section-heading getting-started">
        <div>
          <h2>A good place to begin</h2>
          <p>A few thoughtful steps to build your circle.</p>
        </div>
        <span className="badge">FOUNDATION • PHASE 1</span>
      </div>
      <div className="steps">
        {[
          {
            n: '01',
            icon: Building2,
            title: 'Create your organization',
            text: 'Give your community a dedicated space with secure, separate access.',
          },
          {
            n: '02',
            icon: Users,
            title: 'Shape your savings circle',
            text: 'Rotating payouts, random draws, or pooled savings. Group setup arrives in a later phase.',
          },
          {
            n: '03',
            icon: Wallet,
            title: 'Grow with confidence',
            text: 'Verified contributions and auditable payouts are planned for later phases.',
          },
        ].map((step, i) => (
          <article className="step" key={step.n}>
            <div className="step-top">
              <step.icon size={22} />
              <span>{step.n}</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
            {i === 0 ? (
              <NavLink to="/organizations">
                Get started <ChevronRight size={15} />
              </NavLink>
            ) : (
              <span className="small muted">Planned</span>
            )}
          </article>
        ))}
      </div>
      <div className="trust-strip">
        <ShieldCheck size={24} />
        <div>
          <h3>A secure foundation for every circle</h3>
          <p>
            Organization access is enforced in the database. Financial workflows will be introduced
            in subsequent phases.
          </p>
        </div>
        <Check size={20} />
      </div>
    </>
  )
}
