import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from './AuthContext'
import type { Database } from '../types/database.types'

type Family = Database['public']['Tables']['families']['Row']
type FamilyMember = Database['public']['Tables']['family_members']['Row']

interface FamilyContextValue {
  family: Family | null
  members: FamilyMember[]
  myMembership: FamilyMember | null
  reload: () => void
}

const FamilyContext = createContext<FamilyContextValue>({
  family: null, members: [], myMembership: null, reload: () => {},
})

export function FamilyProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!session) { setFamily(null); setMembers([]); return }
    loadFamily(session.user.id)
  }, [session, tick])

  async function loadFamily(userId: string) {
    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id, family:families(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .single()

    if (!membership) { setFamily(null); setMembers([]); return }

    const familyData = (membership as any).family as Family
    setFamily(familyData)

    const { data: allMembers } = await supabase
      .from('family_members')
      .select('*, profiles(display_name, avatar_url)')
      .eq('family_id', familyData.id)
      .neq('status', 'removed')

    setMembers(allMembers ?? [])
  }

  const myMembership = members.find(m => m.user_id === session?.user.id) ?? null

  return (
    <FamilyContext.Provider value={{ family, members, myMembership, reload }}>
      {children}
    </FamilyContext.Provider>
  )
}

export function useFamily() {
  return useContext(FamilyContext)
}
