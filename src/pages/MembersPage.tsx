import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'
import type { Database } from '../types/database.types'

const inviteSchema = z.object({ email: z.string().email('Valid email required') })
type InviteForm = z.infer<typeof inviteSchema>

type Member = {
  id: string
  role: string
  status: string
  joined_at: string | null
  user_id: string | null
  invited_email: string | null
  profiles: { display_name: string; avatar_url: string | null } | null
}

export function MembersPage() {
  const { family, members, myMembership, reload } = useFamily()
  const isOwner = myMembership?.role === 'owner'

  if (!family) return <p className="text-muted">No family found.</p>

  return (
    <div>
      <h2 className="mb-4">Members — {family.name}</h2>
      <MembersList members={members} isOwner={isOwner} familyId={family.id} onChanged={reload} />
      {isOwner && <InviteForm familyId={family.id} onInvited={reload} />}
    </div>
  )
}

function MembersList({ members, isOwner, familyId, onChanged }: {
  members: Member[]
  isOwner: boolean
  familyId: string
  onChanged: () => void
}) {
  return (
    <div className="card mb-4">
      <ul className="list-group list-group-flush">
        {members.map((m) => (
          <li key={m.id} className="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <strong>{m.profiles?.display_name ?? m.invited_email ?? 'Unknown'}</strong>
              <span className={`badge ms-2 bg-${m.status === 'active' ? 'success' : 'secondary'}`}>{m.status}</span>
              <span className="badge ms-1 bg-info text-dark">{m.role}</span>
            </div>
            {isOwner && m.role !== 'owner' && (
              <RemoveButton memberId={m.id} familyId={familyId} onRemoved={onChanged} />
            )}
          </li>
        ))}
        {members.length === 0 && <li className="list-group-item text-muted">No members yet.</li>}
      </ul>
    </div>
  )
}

function RemoveButton({ memberId, familyId, onRemoved }: { memberId: string; familyId: string; onRemoved: () => void }) {
  const [removing, setRemoving] = useState(false)

  async function remove() {
    setRemoving(true)
    const { error } = await supabase.from('family_members')
      .update({ status: 'removed' })
      .eq('id', memberId)
      .eq('family_id', familyId)
    if (error) { toastError(error); setRemoving(false); return }
    toast.success('Member removed')
    onRemoved()
  }

  return (
    <button className="btn btn-sm btn-outline-danger" disabled={removing} onClick={remove}>
      {removing ? '…' : 'Remove'}
    </button>
  )
}

function InviteForm({ familyId, onInvited }: { familyId: string; onInvited: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
  })

  async function submit({ email }: InviteForm) {
    try {
      const { error } = await supabase.functions.invoke('invite-member', { body: { family_id: familyId, email } })
      if (error) throw error
      toast.success(`Invite sent to ${email}`)
      reset()
      onInvited()
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="card p-4">
      <h5 className="mb-3">Invite a member</h5>
      <form onSubmit={handleSubmit(submit)} className="d-flex gap-2">
        <div className="flex-grow-1">
          <input
            className={`form-control ${errors.email ? 'is-invalid' : ''}`}
            placeholder="Email address"
            {...register('email')}
          />
          {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
        </div>
        <button className="btn btn-primary" disabled={isSubmitting}>Send invite</button>
      </form>
    </div>
  )
}
