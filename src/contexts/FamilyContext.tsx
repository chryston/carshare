import { createContext, useContext, ReactNode } from 'react'

interface FamilyContextValue {
  family: { id: string; name: string } | null
}

const FamilyContext = createContext<FamilyContextValue>({ family: null })

export function FamilyProvider({ children }: { children: ReactNode }) {
  return <FamilyContext.Provider value={{ family: null }}>{children}</FamilyContext.Provider>
}

export function useFamily() {
  return useContext(FamilyContext)
}
