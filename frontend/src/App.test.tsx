import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the API as online when the health check succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ok' })))

    render(<App />)

    expect(await screen.findByText('API: online')).toBeInTheDocument()
  })

  it('shows the API as offline when the health check fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<App />)

    expect(await screen.findByText('API: offline')).toBeInTheDocument()
  })
})
