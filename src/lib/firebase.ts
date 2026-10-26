// Optional Firebase wiring. When VITE_FIREBASE_* is set (per environment in Vercel: staging vs production),
// the app can be pointed at Firestore; otherwise it runs on the local demo backend in db.ts.
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, initializeFirestore, persistentLocalCache, type Firestore } from 'firebase/firestore'

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

import { firebaseEnabled } from './env'
export { firebaseEnabled }

let app: FirebaseApp | null = null
let db: Firestore | null = null
export function getFirebase() {
  if (!firebaseEnabled) return null
  if (!app) {
    app = initializeApp(cfg)
    // IndexedDB-backed offline persistence: writes queue on bad wifi and sync on reconnect.
    try { db = initializeFirestore(app, { localCache: persistentLocalCache() }) } catch { db = getFirestore(app) }
  }
  return { app, db: db! }
}
