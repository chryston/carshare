import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'

type Address = { id: string; label: string; street: string; city: string; state: string | null; country: string; postal_code: string | null }

const schema = z.object({
  label: z.string().min(1, 'Label required'),
  street: z.string().min(1, 'Street required'),
  city: z.string().min(1, 'City required'),
  state: z.string().optional(),
  country: z.string().min(1, 'Country required'),
  postal_code: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export function AddressesPage() {
  const { family, myMembership } = useFamily()
  const isOwner = myMembership?.role === 'owner'
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (family) loadAddresses()
  }, [family])

  async function loadAddresses() {
    setLoading(true)
    const { data, error } = await supabase
      .from('addresses')
      .select('id, label, street, city, state, country, postal_code')
      .eq('family_id', family!.id)
      .order('label')
    if (error) { toastError(error); setLoading(false); return }
    setAddresses(data ?? [])
    setLoading(false)
  }

  async function deleteAddress(id: string) {
    const { error } = await supabase.from('addresses').delete().eq('id', id)
    if (error) { toastError(error); return }
    toast.success('Address deleted')
    setAddresses(prev => prev.filter(a => a.id !== id))
  }

  if (!family) return <p className="text-muted">No family found.</p>

  return (
    <div>
      <h2 className="mb-4">Addresses</h2>
      {loading ? (
        <div className="spinner-border text-primary" role="status" />
      ) : (
        <div className="card mb-4">
          <ul className="list-group list-group-flush">
            {addresses.map(a => (
              <li key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
                <div>
                  <strong>{a.label}</strong>
                  <span className="text-muted ms-2">{a.street}, {a.city}{a.state ? `, ${a.state}` : ''}, {a.country}</span>
                </div>
                {isOwner && (
                  <button className="btn btn-sm btn-outline-danger" onClick={() => deleteAddress(a.id)}>Delete</button>
                )}
              </li>
            ))}
            {addresses.length === 0 && <li className="list-group-item text-muted">No addresses yet.</li>}
          </ul>
        </div>
      )}
      {isOwner && <AddAddressForm familyId={family.id} onAdded={loadAddresses} />}
    </div>
  )
}

function AddAddressForm({ familyId, onAdded }: { familyId: string; onAdded: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function submit(data: FormData) {
    try {
      const { error } = await supabase.from('addresses').insert({
        family_id: familyId,
        label: data.label,
        street: data.street,
        city: data.city,
        state: data.state ?? null,
        country: data.country,
        postal_code: data.postal_code ?? null,
      })
      if (error) throw error
      toast.success('Address added')
      reset()
      onAdded()
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="card p-4">
      <h5 className="mb-3">Add address</h5>
      <form onSubmit={handleSubmit(submit)}>
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <input className={`form-control ${errors.label ? 'is-invalid' : ''}`} placeholder="Label (e.g. Home)" {...register('label')} />
            {errors.label && <div className="invalid-feedback">{errors.label.message}</div>}
          </div>
          <div className="col-md-8">
            <input className={`form-control ${errors.street ? 'is-invalid' : ''}`} placeholder="Street" {...register('street')} />
            {errors.street && <div className="invalid-feedback">{errors.street.message}</div>}
          </div>
          <div className="col-md-4">
            <input className={`form-control ${errors.city ? 'is-invalid' : ''}`} placeholder="City" {...register('city')} />
            {errors.city && <div className="invalid-feedback">{errors.city.message}</div>}
          </div>
          <div className="col-md-2">
            <input className="form-control" placeholder="State" {...register('state')} />
          </div>
          <div className="col-md-3">
            <input className={`form-control ${errors.country ? 'is-invalid' : ''}`} placeholder="Country" {...register('country')} />
            {errors.country && <div className="invalid-feedback">{errors.country.message}</div>}
          </div>
          <div className="col-md-3">
            <input className="form-control" placeholder="Postal code" {...register('postal_code')} />
          </div>
        </div>
        <button className="btn btn-primary" disabled={isSubmitting}>Add address</button>
      </form>
    </div>
  )
}
