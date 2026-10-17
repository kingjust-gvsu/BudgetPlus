import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { auth } from '../firebase'
import { AuthContext, type AuthState, type SignedInUser } from './authContext'

// Keeps track of who is signed in and shares it with the rest of the app.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null | undefined>(undefined)

  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? { email: firebaseUser.email, displayName: firebaseUser.displayName } : null)
    })
  }, [])

  // Only rebuild when the user changes, so components depending on these functions don't re-run needlessly
  const value = useMemo<AuthState>(
    () => ({
      user,
      signInWithGoogle: async () => {
        await signInWithPopup(auth, new GoogleAuthProvider())
      },
      signOut: () => signOut(auth),
      getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
