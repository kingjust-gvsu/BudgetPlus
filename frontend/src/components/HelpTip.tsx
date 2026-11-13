import { useId, type ReactNode } from 'react'

type Props = {
  // What the "?" explains, read by screen readers, e.g. "What are bills and expenses?"
  label: string
  children: ReactNode
}

// A small circled "?" that shows an explanation on hover or keyboard focus.
export function HelpTip({ label, children }: Props) {
  const id = useId()
  return (
    <div className="help-tip">
      <button type="button" className="help-tip-button" aria-label={label} aria-describedby={id}>
        ?
      </button>
      <div role="tooltip" id={id} className="help-tip-text">
        {children}
      </div>
    </div>
  )
}
