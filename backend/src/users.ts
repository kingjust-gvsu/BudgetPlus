import type { FindOrCreateUser } from './auth.ts'
import type { Database } from './db.ts'

const fields = { id: true, firebaseUid: true, email: true } as const

// Finds the user by their Firebase ID, creating the record on first sign-in.
// Keeps the stored email in sync with Firebase.
export function createFindOrCreateUser(db: Database): FindOrCreateUser {
  return ({ uid, email }) =>
    db.user.upsert({
      where: { firebaseUid: uid },
      update: { email: email ?? null },
      create: { firebaseUid: uid, email: email ?? null },
      select: fields,
    })
}
