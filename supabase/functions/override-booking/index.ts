import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'
import { fetchAddressSnapshots } from '../_shared/addresses.ts'

serve(async (req) => {
  try {
    return await handleOverrideBooking(req)
  } catch (err) {
    return respondError(err)
  }
})

async function handleOverrideBooking(req: Request): Promise<Response> {
  const user = await requireUser(req)
  const body = await parseBody(req)
  await assertIsOwner(user.id, body.family_id)
  validateTimes(body.starts_at, body.ends_at)
  await fetchAddressSnapshots(body.pickup_address_id, body.dropoff_address_id)
  const newBookingId = await atomicOverride(user.id, body)
  return ok({ new_booking_id: newBookingId })
}

async function parseBody(req: Request) {
  const body = await req.json()
  const required = ['cancel_booking_id', 'family_id', 'car_id', 'starts_at', 'ends_at']
  for (const field of required) {
    if (!body[field]) throw new AppError(`${field} is required`)
  }
  return body as {
    cancel_booking_id: string
    family_id: string
    car_id: string
    starts_at: string
    ends_at: string
    description?: string
    pickup_address_id?: string
    dropoff_address_id?: string
  }
}

function validateTimes(startsAt: string, endsAt: string) {
  if (new Date(endsAt) <= new Date(startsAt)) {
    throw new AppError('ends_at must be after starts_at', 422)
  }
}

async function assertIsOwner(userId: string, familyId: string) {
  const db = serviceDb()
  const { data } = await db.from('family_members')
    .select('id')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .single()
  if (!data) throw new AppError('Only owners can override bookings', 403)
}

async function atomicOverride(
  userId: string,
  body: {
    cancel_booking_id: string
    family_id: string
    car_id: string
    starts_at: string
    ends_at: string
    description?: string
    pickup_address_id?: string
    dropoff_address_id?: string
  }
) {
  const db = serviceDb()
  // Amendment A6: atomic cancel + insert via PL/pgSQL function
  const { data, error } = await db.rpc('override_booking', {
    p_cancel_id: body.cancel_booking_id,
    p_family_id: body.family_id,
    p_car_id: body.car_id,
    p_booked_by: userId,
    p_starts_at: body.starts_at,
    p_ends_at: body.ends_at,
    p_description: body.description ?? null,
    p_pickup_id: body.pickup_address_id ?? null,
    p_dropoff_id: body.dropoff_address_id ?? null,
  })
  if (error) throw new AppError(error.message)
  return data as string
}
