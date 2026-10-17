import type { RequestHandler, Response } from 'express'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

// Who the request is from, according to the verified Firebase sign-in token.
export type FirebaseIdentity = {
  uid: string
  email?: string
}

// Our own user record, linked to the Firebase account.
export type AuthenticatedUser = {
  id: string
  firebaseUid: string
  email: string | null
}

// Checks a sign-in token and returns who it belongs to. Throws if the token is invalid or expired.
export type VerifyToken = (token: string) => Promise<FirebaseIdentity>

// Looks up the user's record, creating it the first time they sign in.
export type FindOrCreateUser = (identity: FirebaseIdentity) => Promise<AuthenticatedUser>

// Verifies tokens with Firebase. Only the project ID is needed, not a secret key.
export function createFirebaseTokenVerifier(projectId: string): VerifyToken {
  const auth = getAuth(initializeApp({ projectId }))
  return async (token) => {
    const decoded = await auth.verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email }
  }
}

// Rejects requests without a valid sign-in token; otherwise makes the user available to the route.
export function requireAuth(verifyToken: VerifyToken, findOrCreateUser: FindOrCreateUser): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('Authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    if (!token) {
      res.status(401).json({ error: 'Not signed in' })
      return
    }

    let identity: FirebaseIdentity
    try {
      identity = await verifyToken(token)
    } catch {
      res.status(401).json({ error: 'Invalid or expired sign-in' })
      return
    }

    res.locals.user = await findOrCreateUser(identity)
    next()
  }
}

// Returns the signed-in user. Only use in routes behind requireAuth.
export function currentUser(res: Response): AuthenticatedUser {
  return res.locals.user as AuthenticatedUser
}
