import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CircleHelp, Menu, X } from 'lucide-react'
import { ThemeToggle } from './menus'

export function PublicMobileMenu({
  sections,
}: {
  sections: readonly (readonly [string, string])[]
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const close = () => setOpen(false)

  useEffect(() => {
    const element = dialog.current
    if (!open) {
      element?.close()
      return
    }
    element?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnDesktop = window.matchMedia('(min-width: 50.001rem)')
    const resize = () => {
      if (closeOnDesktop.matches) setOpen(false)
    }
    closeOnDesktop.addEventListener('change', resize)
    return () => {
      element?.close()
      document.body.style.overflow = previousOverflow
      closeOnDesktop.removeEventListener('change', resize)
    }
  }, [open])

  return (
    <div className="public-mobile-actions">
      <ThemeToggle />
      <button
        className="icon-button public-menu-trigger"
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Menu size={21} />
      </button>
      <dialog
        ref={dialog}
        className="public-mobile-menu"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <div className="public-mobile-menu-panel">
          <div className="public-mobile-menu-heading">
            <div>
              <span className="eyebrow">YOUR COMMUNITY STARTS HERE</span>
              <h2 id={titleId}>Explore RepaCircle</h2>
            </div>
            <button className="icon-button" aria-label="Close menu" onClick={close}>
              <X size={20} />
            </button>
          </div>
          {sections.length > 0 && (
            <nav className="public-mobile-section-links" aria-label="Mobile page sections">
              {sections.map(([href, label], index) => (
                <a key={href} href={href} onClick={close}>
                  <span className="mobile-section-number">0{index + 1}</span>
                  <span>{label}</span>
                  <ArrowUpRight size={17} />
                </a>
              ))}
            </nav>
          )}
          <Link className="public-mobile-help" to="/help" onClick={close}>
            <CircleHelp size={18} /> Help & getting started <ArrowUpRight size={16} />
          </Link>
          <div className="public-mobile-account-links">
            <Link to="/login" className="button button-secondary" onClick={close}>
              Sign in
            </Link>
            <Link to="/register" className="button" onClick={close}>
              Get started <ArrowUpRight size={17} />
            </Link>
          </div>
          <p className="public-mobile-menu-note">
            <span className="green-dot" /> A little from each. More for everyone.
          </p>
        </div>
      </dialog>
    </div>
  )
}
