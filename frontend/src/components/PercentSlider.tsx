type Props = {
  // What the other percent-of-income categories already use, e.g. 60 for 60%
  otherTotal: number
  // This category's percent as typed (kept as text so values like "12." can be typed)
  value: string
  onChange: (value: string) => void
  // Screen-reader name, e.g. "Percent of income slider for Groceries"
  label: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

// A bar from 0% to 100% of income: the part other categories use is grey, and this category's
// share is dragged out from where theirs ends, so the total can never go past 100%.
// Dragging moves in whole percents; the number box next to it takes exact values.
export function PercentSlider({ otherTotal, value, onChange, label }: Props) {
  const room = round2(Math.max(0, 100 - otherTotal))
  const typed = Number(value)
  const own = value.trim() && !Number.isNaN(typed) ? Math.min(Math.max(typed, 0), room) : 0
  const total = round2(otherTotal + own)

  return (
    <div className="percent-slider">
      <div className="percent-track" aria-hidden="true">
        <div className="percent-used" style={{ width: `${otherTotal}%` }} />
        <div className="percent-own" style={{ left: `${otherTotal}%`, width: `${own}%` }} />
      </div>
      {room > 0 && (
        <input
          type="range"
          className="percent-range"
          aria-label={label}
          aria-valuetext={`${own}% for this category, ${total}% of income in total`}
          min={0}
          max={room}
          step={1}
          value={own}
          // The draggable part only covers the room that's left, so it lines up with the bar
          style={{ left: `${otherTotal}%`, width: `${room}%` }}
          onChange={(e) => onChange(String(Number(e.target.value)))}
        />
      )}
      <div className="percent-summary small muted">
        {room > 0
          ? `This category: ${own}% · Total: ${total}% of income`
          : 'Percent budgets already use 100% of income'}
      </div>
    </div>
  )
}
