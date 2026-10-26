import { useEffect } from 'react'
import { create } from 'zustand'

/** Lets a detail screen name itself in the top-bar breadcrumbs ("Room 114", "HK-ROOM-RESET"). */
export const useCrumbStore = create<{ label: string | null }>(() => ({ label: null }))

export function useBreadcrumb(label: string | null | undefined) {
  useEffect(() => {
    useCrumbStore.setState({ label: label ?? null })
    return () => useCrumbStore.setState({ label: null })
  }, [label])
}
