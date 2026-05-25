import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'

type Booking = {
  id: string
  starts_at: string
  ends_at: string
  description: string | null
  status: string
  booked_by: string
  cars: { make: string; model: string; plate: string } | null
  profiles: { display_name: string } | null
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export function CalendarPage() {
  const { family } = useFamily()
  const navigate = useNavigate()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (family) loadBookings()
  }, [family, weekStart])

  async function loadBookings() {
    setLoading(true)
    const weekEnd = addDays(weekStart, 7)
    const { data, error } = await supabase
      .from('bookings')
      .select('id,starts_at,ends_at,description,status,booked_by,cars(make,model,plate),profiles:booked_by(display_name)')
      .eq('family_id', family!.id)
      .eq('status', 'active')
      .gte('starts_at', weekStart.toISOString())
      .lt('starts_at', weekEnd.toISOString())
      .order('starts_at')
    if (error) { toastError(error); setLoading(false); return }
    setBookings((data ?? []) as unknown as Booking[])
    setLoading(false)
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <button className="btn btn-outline-secondary btn-sm me-2" onClick={() => setWeekStart(w => addDays(w, -7))}>‹ Prev</button>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setWeekStart(w => addDays(w, 7))}>Next ›</button>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/bookings/new')}>+ New booking</button>
      </div>

      {loading ? (
        <div className="spinner-border text-primary" role="status" />
      ) : (
        <div className="row g-3">
          {days.map(day => {
            const dayBookings = bookings.filter(b => {
              const bDay = new Date(b.starts_at)
              return bDay.toDateString() === day.toDateString()
            })
            return (
              <div key={day.toISOString()} className="col-md">
                <div className="fw-semibold mb-2 text-muted small">{formatDate(day)}</div>
                {dayBookings.map(b => (
                  <div
                    key={b.id}
                    className="card mb-2 shadow-sm"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/bookings/${b.id}`)}
                  >
                    <div className="card-body py-2 px-3">
                      <div className="fw-semibold small">{formatTime(b.starts_at)}–{formatTime(b.ends_at)}</div>
                      <div className="text-muted small">{b.cars?.make} {b.cars?.model}</div>
                      {b.description && <div className="text-muted small fst-italic">{b.description}</div>}
                      <div className="text-muted small">{b.profiles?.display_name ?? 'Unknown'}</div>
                    </div>
                  </div>
                ))}
                {dayBookings.length === 0 && <div className="text-muted small">—</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
