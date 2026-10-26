import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  ArrowRight,
  Building2,
  Users,
  Wallet,
  ShieldCheck,
  Check,
  CheckCheck,
  MailCheck,
  Fingerprint,
  UserRound,
  ChevronDown,
  CircleHelp,
  Sparkles,
  CircleDot,
  LockKeyhole,
} from 'lucide-react'
import { BrandEmblem } from '@/components/layout/brand'
import { useLandingMotion } from '@/hooks/use-landing-motion'
import '@/styles/landing.css'

const roles = [
  {
    name: 'Organizers',
    icon: Building2,
    title: 'Give your community a place to belong.',
    description:
      'Bring the people and the structure together. Create a dedicated organization and make it clear who is part of your circle.',
    items: [
      'Create and manage your organization',
      'Invite members and assign staff roles',
      'Keep organization details in one place',
    ],
    caption: 'A shared space, thoughtfully organized.',
  },
  {
    name: 'Treasurers',
    icon: Wallet,
    title: 'Start with a clear view of your responsibilities.',
    description:
      'A focused workspace for the groups assigned to you. Build a foundation for accountable collections as financial tools become available.',
    items: [
      'See the groups assigned to your role',
      'Use a role-specific workspace',
      'Protect privileged access with MFA',
    ],
    caption: 'Clear responsibilities. A stronger foundation.',
  },
  {
    name: 'Members',
    icon: Users,
    title: 'Be part of something you build together.',
    description:
      'Join your community through an invitation, keep your personal details current, and find the groups connected to your membership.',
    items: [
      'Accept an invitation to your organization',
      'Manage your profile and account security',
      'See the groups assigned to your membership',
    ],
    caption: 'Your people. Your place in the circle.',
  },
] as const
const questions = [
  [
    'What can I do on RepaCircle today?',
    'Create and verify an account, complete your personal information, create an organization, and manage membership and staff invitations. Dedicated workspaces help organizers, treasurers, and members access the areas relevant to them.',
  ],
  [
    'Does RepaCircle hold or move my money?',
    'RepaCircle does not currently process payments, hold funds, or distribute payouts. Contribution tracking, payment verification, and payout workflows are planned features.',
  ],
  [
    'Can I use my Google account?',
    'Choose Continue with Google when it is available on the sign-in or registration page. The same option signs in existing users and creates accounts for new users. New accounts complete their personal information before entering a workspace.',
  ],
  [
    'What information do I need to get started?',
    'Start with your name and email. After verification, complete your first and last name, mobile number, gender selection, and Philippine address. Middle name, extension name, and postal code are optional, and gender includes a prefer-not-to-say option.',
  ],
  [
    'How do I join an existing community?',
    'Ask the organization owner for an invitation. Open the invitation link and sign in using the invited email address. Verify your email and complete your personal information before accepting the invitation.',
  ],
] as const

export default function Landing() {
  const ref = useLandingMotion()
  const [roleIndex, setRoleIndex] = useState(0)
  const role = roles[roleIndex]
  const RoleIcon = role.icon
  return (
    <div className="landing-page" ref={ref}>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <span className="eyebrow hero-reveal">
            <span className="green-dot" /> A STRONGER COMMUNITY, TOGETHER
          </span>
          <h1 id="landing-title" className="hero-reveal">
            Small contributions.
            <br />
            <span>Shared possibilities.</span>
          </h1>
          <p className="hero-reveal">
            Big plans begin with people who show up for each other. Give your community a shared
            space to connect, organize, and prepare for its savings journey.
          </p>
          <div className="landing-hero-actions hero-reveal">
            <Link className="button" to="/organizations">
              Set up your community <ArrowUpRight size={18} />
            </Link>
            <a className="landing-text-link" href="#how-it-works">
              See how it works <ArrowRight size={16} />
            </a>
          </div>
          <div className="landing-hero-assurance hero-reveal">
            <span>
              <MailCheck size={15} /> Verified accounts
            </span>
            <span>
              <Users size={15} /> Clear community roles
            </span>
          </div>
        </div>
        <div
          className="landing-circle-scene"
          aria-label="Organizers, treasurers, and members connected around one community"
        >
          <span className="scene-eyebrow">ONE COMMUNITY. CLEAR ROLES.</span>
          <div className="landing-orbit-track" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="landing-orbit-inner" aria-hidden="true" />
          <BrandEmblem className="landing-scene-emblem" />
          <div className="circle-role-chip circle-role-chip--organizer">
            <span className="scene-chip-icon">
              <Building2 size={18} />
            </span>
            <div>
              <strong>Organizer</strong>
              <small>Bring people together</small>
            </div>
          </div>
          <div className="circle-role-chip circle-role-chip--treasurer">
            <span className="scene-chip-icon">
              <Wallet size={18} />
            </span>
            <div>
              <strong>Treasurer</strong>
              <small>A shared responsibility</small>
            </div>
          </div>
          <div className="circle-role-chip circle-role-chip--member">
            <span className="scene-chip-icon">
              <Users size={18} />
            </span>
            <div>
              <strong>Member</strong>
              <small>Every person matters</small>
            </div>
          </div>
          <span className="scene-caption">
            <span className="green-dot" /> Better, together.
          </span>
        </div>
      </section>
      <div className="landing-principles" data-aos="fade-up">
        {[
          {
            icon: Users,
            title: 'People at the center',
            text: 'Built around the communities you belong to.',
          },
          {
            icon: CircleDot,
            title: 'A little more clarity',
            text: 'One home for your organization and its members.',
          },
          {
            icon: ShieldCheck,
            title: 'Trust from the start',
            text: 'Verified accounts and access based on your role.',
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon size={23} />
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </div>
      <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-section-heading" data-aos="fade-up">
          <div>
            <span className="eyebrow">01 / GETTING STARTED</span>
            <h2 id="how-title">A good place to begin.</h2>
          </div>
          <p>
            From your first hello to your own community space. A few simple steps bring your circle
            closer.
          </p>
        </div>
        <div className="landing-steps">
          {[
            {
              n: '01',
              icon: MailCheck,
              title: 'Make it yours',
              text: 'Create an account with email or Google. Verify your email so your community knows it is you.',
            },
            {
              n: '02',
              icon: Fingerprint,
              title: 'Introduce yourself',
              text: 'Complete your personal information and select your Philippine address, from region to barangay.',
            },
            {
              n: '03',
              icon: Building2,
              title: 'Find your circle',
              text: 'Create an organization for your community, or accept an invitation to one you already belong to.',
            },
          ].map(({ n, icon: Icon, title, text }, index) => (
            <article
              className="landing-step"
              key={n}
              data-aos="fade-up"
              data-aos-delay={index * 80}
            >
              <div className="landing-step-top">
                <span className="landing-step-icon">
                  <Icon size={25} />
                </span>
                <span className="landing-step-number">{n}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section
        className="landing-section landing-roles"
        id="for-your-community"
        aria-labelledby="roles-title"
      >
        <div className="landing-section-heading" data-aos="fade-up">
          <div>
            <span className="eyebrow">02 / A PLACE FOR EVERYONE</span>
            <h2 id="roles-title">
              Different roles.
              <br />
              One shared purpose.
            </h2>
          </div>
          <p>
            Every circle has people who lead, people who keep things in order, and people who make
            it all worthwhile.
          </p>
        </div>
        <div className="landing-role-panel" data-aos="fade-up">
          <div className="landing-role-story">
            <div className="landing-role-picker" role="group" aria-label="Explore community roles">
              {roles.map((item, index) => (
                <button
                  type="button"
                  key={item.name}
                  aria-pressed={roleIndex === index}
                  onClick={() => setRoleIndex(index)}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <div className="landing-role-copy" aria-live="polite" aria-atomic="true">
              <h3>{role.title}</h3>
              <p>{role.description}</p>
              <ul>
                {role.items.map((item) => (
                  <li key={item}>
                    <Check size={17} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Link className="landing-text-link" to="/register">
              Create your account <ArrowUpRight size={17} />
            </Link>
          </div>
          <div
            className="landing-workspace-preview"
            aria-label={`${role.name} workspace illustration`}
          >
            <div className="workspace-preview-heading">
              <span>
                <span className="green-dot" /> YOUR COMMUNITY
              </span>
              <span>Illustration</span>
            </div>
            <div className="workspace-preview-body">
              <div className="workspace-preview-rail" aria-hidden="true">
                <Building2 size={18} />
                <Users size={18} />
                <Wallet size={18} />
                <ShieldCheck size={18} />
              </div>
              <div className="workspace-preview-main">
                <span className="workspace-role-icon">
                  <RoleIcon size={30} />
                </span>
                <span className="eyebrow">{role.name}</span>
                <h3>
                  A space to
                  <br />
                  move forward together.
                </h3>
                <p>{role.caption}</p>
                <div className="workspace-preview-row">
                  <span>
                    <CheckCheck size={17} />
                    Your community
                  </span>
                  <ArrowUpRight size={16} />
                </div>
                <div className="workspace-preview-row">
                  <span>
                    <UserRound size={17} />
                    Your place in it
                  </span>
                  <ArrowUpRight size={16} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="landing-section" id="whats-included" aria-labelledby="included-title">
        <div className="landing-section-heading" data-aos="fade-up">
          <div>
            <span className="eyebrow">03 / GROWING WITH YOUR COMMUNITY</span>
            <h2 id="included-title">
              A strong foundation today.
              <br />
              More possibilities ahead.
            </h2>
          </div>
          <p>
            Start with the essentials. We’re building the next steps of the savings journey on top
            of them.
          </p>
        </div>
        <div className="landing-availability">
          <article className="availability-card" data-aos="fade-up">
            <span className="availability-badge">
              <span className="green-dot" /> Available now
            </span>
            <h3>Bring your circle together.</h3>
            <p>The essentials to organize people and give everyone the right access.</p>
            <ul>
              {[
                'Email verification and account sign-in',
                'Personal profiles with Philippine addresses',
                'Organizations, membership, and invitations',
                'Role-based access and account security',
              ].map((text) => (
                <li key={text}>
                  <Check size={17} />
                  {text}
                </li>
              ))}
            </ul>
            <Link className="button" to="/register">
              Start with your account <ArrowUpRight size={17} />
            </Link>
          </article>
          <article
            className="availability-card availability-card--future"
            data-aos="fade-up"
            data-aos-delay="100"
          >
            <span className="availability-badge">
              <Sparkles size={14} /> On the roadmap
            </span>
            <h3>Build toward shared goals.</h3>
            <p>These features are planned and are not yet available for financial activity.</p>
            <ul>
              {[
                'Savings group rules and schedules',
                'Contribution tracking and payment verification',
                'Payout planning and distribution workflows',
                'Community reports and financial statements',
              ].map((text) => (
                <li key={text}>
                  <CircleDot size={16} />
                  {text}
                </li>
              ))}
            </ul>
            <Link className="landing-text-link" to="/help">
              Explore help & setup <ArrowRight size={17} />
            </Link>
          </article>
        </div>
      </section>
      <section className="landing-trust" aria-labelledby="trust-title" data-aos="fade-up">
        <div className="landing-trust-emblem" aria-hidden="true">
          <LockKeyhole size={48} />
        </div>
        <div>
          <span className="eyebrow">GOOD COMMUNITIES START WITH TRUST</span>
          <h2 id="trust-title">
            Your community is personal.
            <br />
            Your workspace should respect that.
          </h2>
          <p>
            Verified email addresses, access based on membership, and extra sign-in protection for
            privileged roles help keep the right people in the right places.
          </p>
          <div className="landing-trust-links">
            <Link to="/privacy">
              Read our privacy draft <ArrowUpRight size={15} />
            </Link>
            <Link to="/terms">
              View our terms draft <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </section>
      <section className="landing-section landing-faq" id="questions" aria-labelledby="faq-title">
        <div data-aos="fade-up">
          <span className="eyebrow">04 / A LITTLE MORE CLARITY</span>
          <h2 id="faq-title">
            Good questions.
            <br />
            Clear answers.
          </h2>
          <p>A few things to know before bringing your people together.</p>
          <Link className="landing-text-link" to="/help">
            <CircleHelp size={17} /> Visit help & setup
          </Link>
        </div>
        <div className="landing-faq-list" data-aos="fade-up">
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={19} aria-hidden="true" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="landing-final-cta" data-aos="fade-up" aria-labelledby="cta-title">
        <BrandEmblem />
        <span className="eyebrow">YOUR PEOPLE. YOUR POSSIBILITIES.</span>
        <h2 id="cta-title">
          The next chapter
          <br />
          starts with your circle.
        </h2>
        <p>Make space for the people and plans that matter.</p>
        <div>
          <Link to="/register" className="button">
            Let’s get started <ArrowUpRight size={18} />
          </Link>
          <Link to="/login" className="landing-text-link">
            Already part of a circle? Sign in <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
