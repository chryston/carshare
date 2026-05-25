import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { reload } = useFamily()
  const [status, setStatus] = useState<'accepting' | 'error'>('accepting')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setStatus('error'); return }
    acceptInvite(token)
  }, [])

  async function acceptInvite(token: string) {
    const { data, error } = await supabase.functions.invoke('accept-invite', { body: { token } })
    if (error) { toastError(error); setStatus('error'); return }
    reload()
    navigate('/calendar')
  }

  if (status === 'error') {
    return (
      <div className="container mt-5 text-center">
        <h2>Invalid invite link</h2>
        <p className="text-muted">This link may have expired or already been used.</p>
        <button className="btn btn-primary" onClick={() => navigate('/onboarding')}>Go to onboarding</button>
      </div>
    )
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="text-center">
        <div className="spinner-border text-primary mb-3" role="status" />
        <p className="text-muted">Accepting your invite…</p>
      </div>
    </div>
  )
}
