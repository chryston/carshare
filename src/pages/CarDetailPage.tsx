import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'

type Car = {
  id: string; make: string; model: string; year: number | null; plate: string; color: string | null
  location_address_id: string | null; location_notes: string | null
}
type Address = { id: string; label: string; street: string; city: string }

const locationSchema = z.object({
  location_address_id: z.string().optional(),
  location_notes: z.string().optional(),
})
type LocationForm = z.infer<typeof locationSchema>

export function CarDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { family, myMembership } = useFamily()
  const isOwner = myMembership?.role === 'owner'
  const [car, setCar] = useState<Car | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id && family) loadData()
  }, [id, family])

  async function loadData() {
    setLoading(true)
    const [carResult, addrResult] = await Promise.all([
      supabase.from('cars').select('id,make,model,year,plate,color,location_address_id,location_notes').eq('id', id!).single(),
      supabase.from('addresses').select('id,label,street,city').eq('family_id', family!.id).order('label'),
    ])
    if (carResult.error) { toastError(carResult.error); setLoading(false); return }
    setCar(carResult.data)
    setAddresses(addrResult.data ?? [])
    setLoading(false)
  }

  if (loading) return <div className="spinner-border text-primary mt-4" role="status" />
  if (!car) return <p className="text-muted">Car not found.</p>

  return (
    <div>
      <h2 className="mb-1">{car.year ? `${car.year} ` : ''}{car.make} {car.model}</h2>
      <p className="text-muted mb-4">{car.plate}{car.color ? ` · ${car.color}` : ''}</p>

      <div className="card p-4 mb-4">
        <h5>Current location</h5>
        {car.location_address_id
          ? <p>{addresses.find(a => a.id === car.location_address_id)?.label ?? 'Unknown address'}{car.location_notes ? ` — ${car.location_notes}` : ''}</p>
          : <p className="text-muted">Location not set</p>
        }
      </div>

      <UpdateLocationForm car={car} addresses={addresses} onUpdated={loadData} />
    </div>
  )
}

function UpdateLocationForm({ car, addresses, onUpdated }: { car: Car; addresses: Address[]; onUpdated: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LocationForm>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      location_address_id: car.location_address_id ?? '',
      location_notes: car.location_notes ?? '',
    },
  })

  async function submit(data: LocationForm) {
    try {
      const { error } = await supabase.from('cars').update({
        location_address_id: data.location_address_id || null,
        location_notes: data.location_notes || null,
      }).eq('id', car.id)
      if (error) throw error
      toast.success('Location updated')
      onUpdated()
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="card p-4">
      <h5 className="mb-3">Update location</h5>
      <form onSubmit={handleSubmit(submit)}>
        <div className="mb-3">
          <label className="form-label">Parked at</label>
          <select className="form-select" {...register('location_address_id')}>
            <option value="">— Not set —</option>
            {addresses.map(a => (
              <option key={a.id} value={a.id}>{a.label} — {a.street}, {a.city}</option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <label className="form-label">Notes (lot, floor, etc.)</label>
          <input className="form-control" placeholder="e.g. Level 3, Bay 12" {...register('location_notes')} />
        </div>
        <button className="btn btn-primary" disabled={isSubmitting}>Save location</button>
      </form>
    </div>
  )
}
