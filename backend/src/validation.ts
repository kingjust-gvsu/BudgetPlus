import { NotFoundError, ValidationError } from './errors.ts'

// Small helpers for checking request bodies. Each throws a ValidationError with a message the
// frontend can show as-is.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function requireObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

export function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} is required`)
  }
  const text = value.trim()
  if (text.length > maxLength) {
    throw new ValidationError(`${field} must be ${maxLength} characters or fewer`)
  }
  return text
}

export function requireOneOf<T extends string>(value: unknown, field: string, options: readonly T[]): T {
  if (typeof value !== 'string' || !options.includes(value as T)) {
    throw new ValidationError(`${field} must be one of: ${options.join(', ')}`)
  }
  return value as T
}

// An id in the URL that isn't even a valid id can't match anything, so it's a 404.
export function requireIdParam(value: string | undefined): string {
  if (!value || !UUID.test(value)) {
    throw new NotFoundError('Not found')
  }
  return value
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
