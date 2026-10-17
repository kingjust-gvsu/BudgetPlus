// Thin wrapper around fetch for calling the Budget+ API.
// Requests go to /api/..., which Vite forwards to the backend in development.

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Pass the signed-in user's token for routes that require sign-in.
export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  const response = await fetch(`/api${path}`, { headers })
  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} failed with status ${response.status}`)
  }
  return (await response.json()) as T
}
