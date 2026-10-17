import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Firebase web app settings come from frontend/.env.local (see .env.example).
// These values identify the project; they are not secrets.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const auth = getAuth(initializeApp(firebaseConfig))
