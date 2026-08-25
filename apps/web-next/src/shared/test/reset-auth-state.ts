import { useAuthStore } from "@/shared/store/auth.store"

/**
 * Zera o estado de auth client-side entre testes: o canal de broadcast
 * cross-tab (localStorage) e o zustand store (redirectIntent).
 */
export function resetAuthState(): void {
  localStorage.clear()
  useAuthStore.setState({ redirectIntent: null })
}
