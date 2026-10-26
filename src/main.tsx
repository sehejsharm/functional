import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// React Query is ready for the Firestore-backed data layer; offline mutations pause and resume with the network.
// Static preview builds (VITE_STATIC_PREVIEW=1) use hash routes and skip the service worker.
const STATIC = import.meta.env.VITE_STATIC_PREVIEW === '1'
const Router = STATIC ? HashRouter : BrowserRouter

const queryClient = new QueryClient({ defaultOptions: { queries: { networkMode: 'offlineFirst' }, mutations: { networkMode: 'offlineFirst' } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router><App /></Router>
    </QueryClientProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD && !STATIC) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js') })
}
