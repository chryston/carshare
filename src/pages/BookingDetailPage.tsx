import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'

type Booking = {
  id: string
  starts_at: string
  ends_at: string
  description: string | null
  status: string
  booked_by: string
  cars: { make: string; model: string; plate: string } | null
  profiles: { display_name: string } | null
  pickup_address: { label: string; street: string; city: string } | null
  dropoff_address: { label: string; street: string; city: string } | null
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const session = useSession()
  const { myMembership } = useFamily()
  const navigate = useNavigate()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (id) loadBooking()
  }, [id])

  async function loadBooking() {
    setLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, starts_at, ends_at, description, status, booked_by,
        cars(make, model, plate),
        profiles:booked_by(display_name),
        pickup_address:pickup_address_id(label, street, city),
        dropoff_address:dropoff_address_id(label, street, city)
      `)
      .eq('id', id!)
      .single()
    if (error) { toastError(error); setLoading(false); return }
    setBooking(data as Booking)
    setLoading(false)
  }

  async function cancelBooking() {
    if (!booking) return
    setCancelling(true)
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)
    if (error) { toastError(error); setCancelling(false); return }
    toast.success('Booking cancelled')
    navigate('/calendar')
  }

  const canCancel = booking && booking.status === 'active' &&
    (booking.booked_by === session?.user.id || myMembership?.role === 'owner')

  if (loading) return <div className="spinner-border text-primary mt-4" role="status" />
  if (!booking) return <p className="text-muted">Booking not found.</p>

  return (
    <div className="row justify-content-center">
      <div className="col-md-7">
        <div className="d-flex justify-content-between align-items-start mb-4">
          <h2>Booking details</h2>
          <span className={`badge bg-${booking.status === 'active' ? 'success' : 'secondary'} fs-6`}>{booking.status}</span>
        </div>

        <div className="card p-4 mb-4">
          <dl className="row mb-0">
            <dt className="col-sm-4">Car</dt>
            <dd className="col-sm-8">{booking.cars?.make} {booking.cars?.model} — {booking.cars?.plate}</dd>

            <dt className="col-sm-4">Booked by</dt>
            <dd className="col-sm-8">{booking.profiles?.display_name ?? 'Unknown'}</dd>

            <dt className="col-sm-4">Start</dt>
            <dd className="col-sm-8">{formatDateTime(booking.starts_at)}</dd>

            <dt className="col-sm-4">End</dt>
            <dd className="col-sm-8">{formatDateTime(booking.ends_at)}</dd>

            {booking.description && <>
              <dt className="col-sm-4">Description</dt>
              <dd className="col-sm-8">{booking.description}</dd>
            </>}

            {booking.pickup_address && <>
              <dt className="col-sm-4">Pickup</dt>
              <dd className="col-sm-8">{booking.pickup_address.label} — {booking.pickup_address.street}, {booking.pickup_address.city}</dd>
            </>}

            {booking.dropoff_address && <>
              <dt className="col-sm-4">Drop-off</dt>
              <dd className="col-sm-8">{booking.dropoff_address.label} — {booking.dropoff_address.street}, {booking.dropoff_address.city}</dd>
            </>}
          </dl>
        </div>

        <div className="d-flex gap-2">
          {canCancel && (
            <>
              <button
                className="btn btn-danger"
                disabled={cancelling}
                onClick={cancelBooking}
              >
                {cancelling ? 'Cancelling…' : 'Cancel booking'}
              </button>
              {myMembership?.role === 'owner' && (
                <button
                  className="btn btn-warning"
                  onClick={() => navigate(`/bookings/${booking.id}/override`)}
                >
                  Override booking
                </button>
              )}
            </>
          )}
          <button className="btn btn-outline-secondary" onClick={() => navigate('/calendar')}>Back to calendar</button>
        </div>
      </div>
    </div>
  )
}
