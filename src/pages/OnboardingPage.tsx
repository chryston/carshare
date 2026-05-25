import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { useFamily } from '../contexts/FamilyContext'
import { toastError, AppError } from '../lib/errors'

const createSchema = z.object({ familyName: z.string().min(2, 'At least 2 characters') })
type CreateForm = z.infer<typeof createSchema>

export function OnboardingPage() {
  const session = useSession()!
  const { family, reload } = useFamily()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'create' | 'wait'>('create')

  if (family) return <Navigate to="/calendar" replace />

  return (
    <div className="row justify-content-center mt-5">
      <div className="col-md-6">
        <h2 className="mb-4">Set up your family</h2>
        <ul className="nav nav-tabs mb-4">
          <li className="nav-item">
            <button className={`nav-link ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
              Create family
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === 'wait' ? 'active' : ''}`} onClick={() => setTab('wait')}>
              Waiting for invite
            </button>
          </li>
        </ul>
        {tab === 'create'
          ? <CreateFamilyForm userId={session.user.id} onCreated={() => { reload(); navigate('/members') }} />
          : <WaitingPanel />}
      </div>
    </div>
  )
}

function CreateFamilyForm({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  })

  async function submit({ familyName }: CreateForm) {
    try {
      const { data: family, error: fErr } = await supabase
        .from('families').insert({ name: familyName }).select().single()
      if (fErr) throw new AppError(fErr.message)

      const { error: mErr } = await supabase.from('family_members').insert({
        family_id: family.id, user_id: userId, role: 'owner', status: 'active', joined_at: new Date().toISOString(),
      })
      if (mErr) throw new AppError(mErr.message)

      onCreated()
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)}>
      <div className="mb-3">
        <label className="form-label">Family name</label>
        <input className={`form-control ${errors.familyName ? 'is-invalid' : ''}`} {...register('familyName')} />
        {errors.familyName && <div className="invalid-feedback">{errors.familyName.message}</div>}
      </div>
      <button className="btn btn-primary" disabled={isSubmitting}>Create family</button>
    </form>
  )
}

function WaitingPanel() {
  return <p className="text-muted">Ask your family owner to invite you. Once accepted, refresh this page.</p>
}
