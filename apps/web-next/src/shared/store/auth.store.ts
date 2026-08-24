import { create } from "zustand"

/** Chave de localStorage usada só como canal de broadcast cross-tab de logout.
 *  Não guarda dado de sessão — apenas um timestamp que dispara o storage event. */
const LOGOUT_CHANNEL_KEY = "rit-auth-logout"

type AuthState = {
  /** Path que o usuário tentou acessar antes de cair no login. */
  redirectIntent: string | null
  setRedirectIntent: (path: string | null) => void
  /** Avisa as outras abas que esta aba fez logout. */
  broadcastLogout: () => void
  /** Escuta logout de outra aba e chama `onForeignLogout`. Retorna a função de
   *  cleanup do listener. */
  subscribeCrossTabLogout: (onForeignLogout: () => void) => () => void
}

/** Estado de auth client-side. A verdade do `user` mora no cache do TanStack
 *  Query (ver `sessionQueryOptions`); este store guarda só a intenção de
 *  redirect e o canal de broadcast de logout entre abas. */
export const useAuthStore = create<AuthState>((set) => ({
  redirectIntent: null,
  setRedirectIntent: (path) => {
    set({ redirectIntent: path })
  },
  broadcastLogout: () => {
    // O valor só precisa mudar para disparar o storage event nas outras abas.
    localStorage.setItem(LOGOUT_CHANNEL_KEY, String(Date.now()))
  },
  subscribeCrossTabLogout: (onForeignLogout) => {
    const handler = (event: StorageEvent) => {
      if (event.key !== LOGOUT_CHANNEL_KEY || event.newValue === null) return
      onForeignLogout()
    }
    window.addEventListener("storage", handler)
    return () => {
      window.removeEventListener("storage", handler)
    }
  },
}))
