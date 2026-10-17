import type { AppDependencies } from '../app.ts'
import type { AuthenticatedUser } from '../auth.ts'

// Test stand-ins for the database and Firebase, so tests run without either.

export const VALID_TOKEN = 'valid-token'

export const testUser: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000001',
  firebaseUid: 'firebase-uid-1',
  email: 'test@example.com',
}

export function fakeDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    checkDatabase: async () => true,
    verifyToken: async (token) => {
      if (token !== VALID_TOKEN) throw new Error('invalid token')
      return { uid: testUser.firebaseUid, email: testUser.email ?? undefined }
    },
    findOrCreateUser: async () => testUser,
    ...overrides,
  }
}
