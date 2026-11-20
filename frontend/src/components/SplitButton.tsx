import { useEffect, useRef, useState } from 'react'
import './SplitButton.css'

type MenuItem = { label: string; onClick: () => void; disabled?: boolean }

type Props = {
  label: string
  onClick: () => void
  menuLabel: string // read aloud for the ▾ button, e.g. "More CSV options"
  items: MenuItem[]
}

// A main button with a ▾ beside it that opens a short menu of related actions
export function SplitButton({ label, onClick, menuLabel, items }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking anywhere else or pressing Escape
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={open ? 'split-button open' : 'split-button'} ref={ref}>
      <button type="button" className="button split-button-main" onClick={onClick}>
        {label}
      </button>
      <button
        type="button"
        className="button split-button-toggle"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="split-button-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="split-button-item"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
