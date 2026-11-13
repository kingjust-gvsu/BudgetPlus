import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HelpTip } from './HelpTip'

describe('HelpTip', () => {
  it('links the "?" button to its explanation for screen readers', () => {
    render(<HelpTip label="What are bills and expenses?">Bills cost what they cost.</HelpTip>)

    const button = screen.getByRole('button', { name: 'What are bills and expenses?' })
    expect(button).toHaveAccessibleDescription('Bills cost what they cost.')
  })
})
