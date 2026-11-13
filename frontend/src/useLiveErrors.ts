import { useState } from 'react'

// Shows form errors as the user types instead of only after they submit.
//
// `errors` maps each field to its current problem (or undefined), in the order they should be
// reported. A field's error shows once the user has changed that field; after a submit
// attempt, every field's error shows. An error from the server shows until the next change.
export function useLiveErrors<Field extends string>(errors: Partial<Record<Field, string>>) {
  const [touched, setTouched] = useState<ReadonlySet<Field>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const entries = Object.entries(errors) as [Field, string | undefined][]
  const firstError = (include: (field: Field) => boolean) =>
    entries.find(([field, message]) => message && include(field))?.[1] ?? null

  return {
    // The message to show right now, if any
    error: serverError ?? firstError((field) => submitted || touched.has(field)),

    // Call when the user changes a field
    touch(...fields: Field[]) {
      setServerError(null)
      setTouched((current) => new Set([...current, ...fields]))
    },

    // Call on submit: returns true if the form can be sent, and shows any errors either way
    trySubmit(): boolean {
      setServerError(null)
      setSubmitted(true)
      return firstError(() => true) === null
    },

    // Call when the server rejects the form
    setServerError,

    // Call after a successful submit that clears the form
    reset() {
      setTouched(new Set())
      setSubmitted(false)
      setServerError(null)
    },
  }
}
