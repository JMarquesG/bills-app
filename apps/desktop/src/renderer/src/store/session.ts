import { create } from 'zustand'

interface SessionState {
  unlocked: boolean
  setUnlocked: (unlocked: boolean) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  unlocked: false,
  setUnlocked: (unlocked: boolean) => set({ unlocked }),
  reset: () => set({ unlocked: false })
}))
