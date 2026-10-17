import { createContext } from 'react'

export type SignedInUser = {
  email: string | null
  displayName: string | null
}

export type AuthState = {
  // undefined while Firebase is still checking for an existing sign-in
  user: SignedInUser | null | undefined
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  // Returns a fresh token to send with API requests
  getToken: () => Promise<string | null>
}

export const AuthContext = createContext<AuthState | null>(null)
