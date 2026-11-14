import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import './UserMenu.css'

// The ☰ button in the top-right corner, opening a small menu with who's signed in, Settings,
// and Sign out. Closes when an item is picked, on a click outside it, or with Escape.
export function UserMenu() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapper = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="user-menu" ref={wrapper}>
      <button
        ref={button}
        type="button"
        className="user-menu-button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div id={menuId} className="user-menu-panel">
          <div className="user-menu-who">
            <strong>{user?.displayName ?? user?.email}</strong>
            {user?.displayName && user.email && <span className="muted small">{user.email}</span>}
          </div>
          <Link to="/settings" className="user-menu-item" onClick={() => setOpen(false)}>
            Settings
          </Link>
          <button type="button" className="user-menu-item" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
