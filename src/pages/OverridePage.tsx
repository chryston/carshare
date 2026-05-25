import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'

type ExistingBooking = {
  id: string; car_id: string; starts_at: string; ends_at: string; description: string | null
  cars: { make: string; model: string; plate: string } | null
  profiles: { display_name: string } | null
}
type Address = { id: string; label: string }

const schema = z.object({
  starts_at: z.string().min(1, 'Start time required'),
  ends_at: z.string().min(1, 'End time required'),
  description: z.string().optional(),
  pickup_address_id: z.string().optional(),
  dropoff_address_id: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function OverridePage() {
  const { id } = useParams<{ id: string }>()
  const { family, myMembership } = useFamily()
  const navigate = useNavigate()
  const [existing, setExisting] = useState<ExistingBooking | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (id && family) loadData()
  }, [id, family])

  async function loadData() {
    setLoading(true)
    const [bookingResult, addrResult] = await Promise.all([
      supabase.from('bookings')
        .select('id,car_id,starts_at,ends_at,description,cars(make,model,plate),profiles:booked_by(display_name)')
        .eq('id', id!)
        .single(),
      supabase.from('addresses').select('id,label').eq('family_id', family!.id).order('label'),
    ])
    if (bookingResult.error) { toastError(bookingResult.error); setLoading(false); return }
    if (addrResult.error) toastError(addrResult.error)
    setExisting(bookingResult.data as ExistingBooking)
    setAddresses(addrResult.data ?? [])
    setLoading(false)
  }

  async function submit(data: FormData) {
    if (!existing || !family) return
    try {
      const { error } = await supabase.functions.invoke('override-booking', {
        body: {
          cancel_booking_id: existing.id,
          family_id: family.id,
          car_id: existing.car_id,
          starts_at: new Date(data.starts_at).toISOString(),
          ends_at: new Date(data.ends_at).toISOString(),
          description: data.description || undefined,
          pickup_address_id: data.pickup_address_id || undefined,
          dropoff_address_id: data.dropoff_address_id || undefined,
        },
      })
      if (error) throw error
      toast.success('Booking overridden')
      navigate('/calendar')
    } catch (err) {
      toastError(err)
    }
  }

  // Guard: owners only
  if (myMembership?.role !== 'owner') return <p className="text-muted">Access denied.</p>

  if (loading) return <div className="spinner-border text-primary mt-4" role="status" />
  if (!existing) return <p className="text-muted">Booking not found.</p>

  return (
    <div className="row justify-content-center">
      <div className="col-md-7">
        <h2 className="mb-4">Override booking</h2>

        <div className="card p-4 mb-4 border-warning">
          <h6 className="text-warning mb-3">⚠ This booking will be cancelled</h6>
          <p className="mb-1"><strong>Car:</strong> {existing.cars?.make} {existing.cars?.model} — {existing.cars?.plate}</p>
          <p className="mb-1"><strong>Booked by:</strong> {existing.profiles?.display_name ?? 'Unknown'}</p>
          <p className="mb-1"><strong>Time:</strong> {formatDateTime(existing.starts_at)} – {formatDateTime(existing.ends_at)}</p>
          {existing.description && <p className="mb-0"><strong>Description:</strong> {existing.description}</p>}
        </div>

        <form onSubmit={handleSubmit(submit)}>
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label">New start</label>
              <input type="datetime-local" className={`form-control ${errors.starts_at ? 'is-invalid' : ''}`} {...register('starts_at')} />
              {errors.starts_at && <div className="invalid-feedback">{errors.starts_at.message}</div>}
            </div>
            <div className="col-md-6">
              <label className="form-label">New end</label>
              <input type="datetime-local" className={`form-control ${errors.ends_at ? 'is-invalid' : ''}`} {...register('ends_at')} />
              {errors.ends_at && <div className="invalid-feedback">{errors.ends_at.message}</div>}
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label">Description (optional)</label>
            <input className="form-control" {...register('description')} />
          </div>
          <div className="row g-3 mb-4">
            <div className="col-md-6">
              <label className="form-label">Pickup address</label>
              <select className="form-select" {...register('pickup_address_id')}>
                <option value="">— Not set —</option>
                {addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Drop-off address</label>
              <select className="form-select" {...register('dropoff_address_id')}>
                <option value="">— Not set —</option>
                {addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-warning" disabled={isSubmitting}>Override booking</button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(`/bookings/${id}`)}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
