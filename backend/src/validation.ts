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

// A calendar date like 2026-10-15; rejects impossible dates like 2026-02-30
export function requireDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${field} must be a date like 2026-10-15`)
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${field} is not a real date`)
  }
  return value
}

// A month like 2026-10
export function requireMonth(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new ValidationError(`${field} must be a month like 2026-10`)
  }
  return value
}

// Money in whole cents: an integer, never a decimal. Zero is not allowed.
const MAX_CENTS = 1_000_000_000 // $10 million, well inside the database's integer limit

export function requireCents(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`${field} must be a whole number of cents`)
  }
  if (value === 0) {
    throw new ValidationError(`${field} can't be zero`)
  }
  if (Math.abs(value) > MAX_CENTS) {
    throw new ValidationError(`${field} is too large`)
  }
  return value
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
