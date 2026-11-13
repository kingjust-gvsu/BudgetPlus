import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PercentSlider } from './PercentSlider'

function renderSlider(otherTotal: number, value: string) {
  const onChange = vi.fn()
  render(<PercentSlider otherTotal={otherTotal} value={value} onChange={onChange} label="Percent slider" />)
  return onChange
}

describe('PercentSlider', () => {
  it("only lets this category use what's left of 100%", () => {
    renderSlider(60, '12')

    const slider = screen.getByRole('slider', { name: 'Percent slider' })
    expect(slider).toHaveAttribute('max', '40')
    expect(slider).toHaveValue('12')
    expect(screen.getByText('This category: 12% · Total: 72% of income')).toBeInTheDocument()
  })

  it('reports whole percents as it is dragged', () => {
    const onChange = renderSlider(60, '12')

    fireEvent.change(screen.getByRole('slider', { name: 'Percent slider' }), { target: { value: '25' } })

    expect(onChange).toHaveBeenCalledWith('25')
  })

  it('keeps an exact typed value like 12.5 in the summary', () => {
    renderSlider(60.5, '12.5')

    expect(screen.getByText('This category: 12.5% · Total: 73% of income')).toBeInTheDocument()
  })

  it('has no slider when other categories already use 100%', () => {
    renderSlider(100, '')

    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.getByText('Percent budgets already use 100% of income')).toBeInTheDocument()
  })
})
