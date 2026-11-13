import './ProgressBar.css'

type Props = {
  // How full the bar is, 0 to 100 (anything outside is clamped)
  percent: number
  // good = green (under a limit), bad = red (over), neutral = gray (bills and funds)
  tone: 'good' | 'bad' | 'neutral'
}

// A thin bar showing how much of a limit is used or how much of a bill is saved.
// Decorative: the numbers next to it carry the meaning for screen readers.
export function ProgressBar({ percent, tone }: Props) {
  return (
    <div className="progress" aria-hidden="true">
      <div className={`progress-fill progress-fill--${tone}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}
