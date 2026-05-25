import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'

type Car = { id: string; make: string; model: string; year: number | null; plate: string }
type Address = { id: string; label: string }

const schema = z.object({
  car_id: z.string().min(1, 'Select a car'),
  starts_at: z.string().min(1, 'Start time required'),
  ends_at: z.string().min(1, 'End time required'),
  description: z.string().optional(),
  pickup_address_id: z.string().optional(),
  dropoff_address_id: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export function BookingFormPage() {
  const { family } = useFamily()
  const navigate = useNavigate()
  const [cars, setCars] = useState<Car[]>([])
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (family) loadOptions()
  }, [family])

  async function loadOptions() {
    const [carsResult, addrsResult] = await Promise.all([
      supabase.from('cars').select('id,make,model,year,plate').eq('family_id', family!.id).order('make'),
      supabase.from('addresses').select('id,label').eq('family_id', family!.id).order('label'),
    ])
    if (carsResult.error) toastError(carsResult.error)
    if (addrsResult.error) toastError(addrsResult.error)
    setCars(carsResult.data ?? [])
    setAddresses(addrsResult.data ?? [])
    setLoading(false)
  }

  async function submit(data: FormData) {
    try {
      const { error } = await supabase.functions.invoke('create-booking', {
        body: {
          family_id: family!.id,
          car_id: data.car_id,
          starts_at: new Date(data.starts_at).toISOString(),
          ends_at: new Date(data.ends_at).toISOString(),
          description: data.description || undefined,
          pickup_address_id: data.pickup_address_id || undefined,
          dropoff_address_id: data.dropoff_address_id || undefined,
        },
      })
      if (error) throw error
      toast.success('Booking created')
      navigate('/calendar')
    } catch (err) {
      toastError(err)
    }
  }

  if (!family) return <p className="text-muted">No family found.</p>

  return (
    <div className="row justify-content-center">
      <div className="col-md-7">
        <h2 className="mb-4">New booking</h2>
        {loading ? (
          <div className="spinner-border text-primary" role="status" />
        ) : (
          <form onSubmit={handleSubmit(submit)}>
            <div className="mb-3">
              <label className="form-label">Car</label>
              <select className={`form-select ${errors.car_id ? 'is-invalid' : ''}`} {...register('car_id')}>
                <option value="">Select a car</option>
                {cars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.year ? `${c.year} ` : ''}{c.make} {c.model} — {c.plate}
                  </option>
                ))}
              </select>
              {errors.car_id && <div className="invalid-feedback">{errors.car_id.message}</div>}
            </div>
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label">Start</label>
                <input type="datetime-local" className={`form-control ${errors.starts_at ? 'is-invalid' : ''}`} {...register('starts_at')} />
                {errors.starts_at && <div className="invalid-feedback">{errors.starts_at.message}</div>}
              </div>
              <div className="col-md-6">
                <label className="form-label">End</label>
                <input type="datetime-local" className={`form-control ${errors.ends_at ? 'is-invalid' : ''}`} {...register('ends_at')} />
                {errors.ends_at && <div className="invalid-feedback">{errors.ends_at.message}</div>}
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">Description (optional)</label>
              <input className="form-control" placeholder="e.g. School run" {...register('description')} />
            </div>
            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <label className="form-label">Pickup address (optional)</label>
                <select className="form-select" {...register('pickup_address_id')}>
                  <option value="">— Not set —</option>
                  {addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Drop-off address (optional)</label>
                <select className="form-select" {...register('dropoff_address_id')}>
                  <option value="">— Not set —</option>
                  {addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" disabled={isSubmitting}>Create booking</button>
            <button type="button" className="btn btn-outline-secondary ms-2" onClick={() => navigate('/calendar')}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  )
}
