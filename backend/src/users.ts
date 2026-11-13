import type { AuthenticatedUser, FindOrCreateUser } from './auth.ts'
import type { Database } from './db.ts'

const fields = { id: true, firebaseUid: true, email: true, monthlyIncomeCents: true } as const

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

// Changes to the signed-in user's own settings.
export type UserStore = {
  setMonthlyIncome(userId: string, monthlyIncomeCents: number | null): Promise<AuthenticatedUser>
}

export function createUserStore(db: Database): UserStore {
  return {
    setMonthlyIncome: (userId, monthlyIncomeCents) =>
      db.user.update({ where: { id: userId }, data: { monthlyIncomeCents }, select: fields }),
  }
}
