import type { FindOrCreateUser } from './auth.ts'
import type { Database } from './db.ts'

// Finds the user by their Firebase ID, creating the record on first sign-in.
// Keeps the stored email in sync with Firebase.
export function createFindOrCreateUser(db: Database): FindOrCreateUser {
  return async ({ uid, email }) => {
    const user = await db.user.upsert({
      where: { firebaseUid: uid },
      update: { email: email ?? null },
      create: { firebaseUid: uid, email: email ?? null },
    })
    return { id: user.id, firebaseUid: user.firebaseUid, email: user.email }
  }
}
