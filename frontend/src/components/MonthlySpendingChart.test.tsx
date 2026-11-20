import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { niceScale } from '../charts'
import { MonthlySpendingChart } from './MonthlySpendingChart'

describe('niceScale', () => {
  it.each([
    [0, 10000, 2500],
    [200000, 200000, 50000],
    [286000, 300000, 100000],
    [212000, 300000, 100000],
    [61000, 80000, 20000],
  ])('fits %i cents under a top of %i with steps of %i', (cents, top, step) => {
    expect(niceScale(cents)).toEqual({ top, step })
  })
})

describe('MonthlySpendingChart', () => {
  const months = [
    { month: '2026-10', billsCents: 150000, expensesCents: 50000 },
    { month: '2026-11', billsCents: 100000, expensesCents: 25000 },
  ]

  it('labels the months and the dollar scale', () => {
    render(<MonthlySpendingChart months={months} />)

    expect(screen.getByText('Oct')).toBeInTheDocument()
    expect(screen.getByText('Nov')).toBeInTheDocument()
    expect(screen.getByText('$2,000')).toBeInTheDocument() // the top of the scale
  })

  it('sizes each bar against the top of the scale', () => {
    const { container } = render(<MonthlySpendingChart months={months} />)

    const october = container.querySelectorAll('.month-chart-stack')[0]
    expect(october.querySelector('.chart-fill--bills')).toHaveStyle({ height: '75%' })
    expect(october.querySelector('.chart-fill--expenses')).toHaveStyle({ height: '25%' })
  })

  it('shows the numbers for a month on hover', () => {
    const { container } = render(<MonthlySpendingChart months={months} />)

    fireEvent.pointerEnter(container.querySelectorAll('.month-chart-column')[1])

    expect(screen.getByText('November 2026', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Total $1,250.00')).toBeInTheDocument()
  })

  it('draws income as a line and says how each month compared', () => {
    render(<MonthlySpendingChart months={months} incomeCents={180000} />)

    expect(screen.getByText(/Income \$1,800/)).toBeInTheDocument()
    expect(screen.getByText('▲ $200').parentElement).toHaveClass('bad') // October: $2,000 spent
    expect(screen.getByText('▼ $550').parentElement).toHaveClass('good') // November: $1,250 spent
  })
})
