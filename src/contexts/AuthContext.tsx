import { createContext, useContext, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'

interface AuthContextValue {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={{ session: null, loading: false }}>{children}</AuthContext.Provider>
}

export function useSession() {
  return useContext(AuthContext).session
}

export function useAuthLoading() {
  return useContext(AuthContext).loading
}
