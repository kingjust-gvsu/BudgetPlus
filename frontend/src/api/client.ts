// Thin wrapper around fetch for calling the Budget+ API.
// Requests go to /api/..., which Vite forwards to the backend in development.

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// The API explains failures as { "error": "..." }; use that message when there is one.
async function toApiError(response: Response, fallback: string): Promise<ApiError> {
  try {
    const body = await response.json()
    if (typeof body?.error === 'string') return new ApiError(response.status, body.error)
  } catch {
    // Not JSON; use the fallback
  }
  return new ApiError(response.status, fallback)
}

function authHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Pass the signed-in user's token for routes that require sign-in.
export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: authHeader(token) })
  if (!response.ok) {
    throw await toApiError(response, `GET ${path} failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

// POST, PATCH, or DELETE. Returns the response body, or undefined when there is none (204).
export async function apiSend<T = void>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { ...authHeader(token), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw await toApiError(response, `${method} ${path} failed with status ${response.status}`)
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}
