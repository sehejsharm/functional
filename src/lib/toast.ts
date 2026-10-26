// App-wide toasts and confirm dialogs. Components call `toast.success(...)` or `await confirm({...})`;
// the hosts (<Toaster/>, <ConfirmHost/>) are mounted once in App.
import { create } from 'zustand'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'
export interface Toast { id: string; tone: ToastTone; title: string; description?: string; action?: { label: string; onClick: () => void }; duration: number }

interface ToastStore { toasts: Toast[]; push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string; dismiss: (id: string) => void }

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2)
    const duration = t.duration ?? (t.action ? 7000 : 4500)
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id, duration }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), duration)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

type Opts = { description?: string; action?: Toast['action']; duration?: number }
const make = (tone: ToastTone) => (title: string, o: Opts = {}) => useToasts.getState().push({ tone, title, ...o })
export const toast = { success: make('success'), error: make('error'), info: make('info'), warning: make('warning') }

export interface ConfirmOptions { title: string; body?: string; confirmLabel?: string; cancelLabel?: string; tone?: 'danger' | 'primary'; requireText?: string; input?: { label: string; placeholder?: string; required?: boolean } }
interface ConfirmStore { req: (ConfirmOptions & { resolve: (v: false | { value: string }) => void }) | null }
export const useConfirmStore = create<ConfirmStore>(() => ({ req: null }))

/** Resolves `true` when confirmed. With `input`, use `prompt()` instead to get the typed value. */
export function confirm(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ req: { ...o, resolve: (v) => resolve(v !== false) } }))
}
/** Confirm with a text field (a reason, a note). Resolves to the text, or null if cancelled. */
export function prompt(o: ConfirmOptions & { input: NonNullable<ConfirmOptions['input']> }): Promise<string | null> {
  return new Promise((resolve) => useConfirmStore.setState({ req: { ...o, resolve: (v) => resolve(v === false ? null : v.value) } }))
}
