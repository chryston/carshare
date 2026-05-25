import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'

type Car = { id: string; make: string; model: string; year: number | null; plate: string; color: string | null }

const schema = z.object({
  make: z.string().min(1, 'Make required'),
  model: z.string().min(1, 'Model required'),
  year: z.preprocess(
    v => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().min(1900).max(2100).optional()
  ),
  plate: z.string().min(1, 'Plate required'),
  color: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export function CarsPage() {
  const { family, myMembership } = useFamily()
  const isOwner = myMembership?.role === 'owner'
  const navigate = useNavigate()
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (family) loadCars()
  }, [family])

  async function loadCars() {
    setLoading(true)
    const { data, error } = await supabase
      .from('cars')
      .select('id, make, model, year, plate, color')
      .eq('family_id', family!.id)
      .order('make')
    if (error) { toastError(error); setLoading(false); return }
    setCars(data ?? [])
    setLoading(false)
  }

  if (!family) return <p className="text-muted">No family found.</p>

  return (
    <div>
      <h2 className="mb-4">Cars</h2>
      {loading ? (
        <div className="spinner-border text-primary" role="status" />
      ) : (
        <div className="row g-3 mb-4">
          {cars.map(car => (
            <div key={car.id} className="col-md-4">
              <div
                className="card h-100 shadow-sm"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/cars/${car.id}`)}
              >
                <div className="card-body">
                  <h5 className="card-title">{car.year ? `${car.year} ` : ''}{car.make} {car.model}</h5>
                  <p className="card-text text-muted">{car.plate}{car.color ? ` · ${car.color}` : ''}</p>
                </div>
              </div>
            </div>
          ))}
          {cars.length === 0 && (
            <div className="col-12"><p className="text-muted">No cars yet.</p></div>
          )}
        </div>
      )}
      {isOwner && <AddCarForm familyId={family.id} onAdded={loadCars} />}
    </div>
  )
}

function AddCarForm({ familyId, onAdded }: { familyId: string; onAdded: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function submit(data: FormData) {
    try {
      const { error } = await supabase.from('cars').insert({
        family_id: familyId,
        make: data.make,
        model: data.model,
        year: data.year ?? null,
        plate: data.plate,
        color: data.color ?? null,
      })
      if (error) throw error
      toast.success('Car added')
      reset()
      onAdded()
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="card p-4">
      <h5 className="mb-3">Add car</h5>
      <form onSubmit={handleSubmit(submit)}>
        <div className="row g-3 mb-3">
          <div className="col-md-3">
            <input className={`form-control ${errors.make ? 'is-invalid' : ''}`} placeholder="Make" {...register('make')} />
            {errors.make && <div className="invalid-feedback">{errors.make.message}</div>}
          </div>
          <div className="col-md-3">
            <input className={`form-control ${errors.model ? 'is-invalid' : ''}`} placeholder="Model" {...register('model')} />
            {errors.model && <div className="invalid-feedback">{errors.model.message}</div>}
          </div>
          <div className="col-md-2">
            <input className="form-control" placeholder="Year" type="number" {...register('year')} />
          </div>
          <div className="col-md-2">
            <input className={`form-control ${errors.plate ? 'is-invalid' : ''}`} placeholder="Plate" {...register('plate')} />
            {errors.plate && <div className="invalid-feedback">{errors.plate.message}</div>}
          </div>
          <div className="col-md-2">
            <input className="form-control" placeholder="Color" {...register('color')} />
          </div>
        </div>
        <button className="btn btn-primary" disabled={isSubmitting}>Add car</button>
      </form>
    </div>
  )
}
