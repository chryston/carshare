import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { toastError } from '../lib/errors'

export function LoginPage() {
  const session = useSession()
  const navigate = useNavigate()

  useEffect(() => { if (session) navigate('/onboarding') }, [session])

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    if (error) toastError(error)
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div className="card p-5 shadow-sm" style={{ maxWidth: 400, width: '100%' }}>
        <h1 className="h3 fw-bold mb-1">CarShare</h1>
        <p className="text-muted mb-4">Family vehicle scheduling</p>
        <button className="btn btn-primary w-100" onClick={signInWithGoogle}>
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
