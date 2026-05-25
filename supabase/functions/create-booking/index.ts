import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'
import { fetchAddressSnapshots } from '../_shared/addresses.ts'

serve(async (req) => {
  try {
    return await handleCreateBooking(req)
  } catch (err) {
    return respondError(err)
  }
})

async function handleCreateBooking(req: Request): Promise<Response> {
  const user = await requireUser(req)
  const body = await parseBody(req)
  validateTimes(body.starts_at, body.ends_at)
  await assertIsMember(user.id, body.family_id)
  await assertNoConflict(body.car_id, body.family_id, body.starts_at, body.ends_at)
  // S3: validate address IDs exist; throws if either is invalid
  if (body.pickup_address_id && body.dropoff_address_id) {
    await fetchAddressSnapshots(body.pickup_address_id, body.dropoff_address_id)
  }
  const booking = await insertBooking(user.id, body)
  return ok(booking)
}

async function parseBody(req: Request) {
  const body = await req.json()
  const required = ['family_id', 'car_id', 'starts_at', 'ends_at']
  for (const field of required) {
    if (!body[field]) throw new AppError(`${field} is required`)
  }
  return body as {
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
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  // Amendment A5: reject bookings starting more than 5 minutes in the past
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  if (start < fiveMinutesAgo) throw new AppError('Booking cannot start more than 5 minutes in the past', 422)
  if (end <= start) throw new AppError('ends_at must be after starts_at', 422)
}

async function assertIsMember(userId: string, familyId: string) {
  const db = serviceDb()
  const { data } = await db.from('family_members')
    .select('id')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .in('status', ['active'])
    .single()
  if (!data) throw new AppError('Not a family member', 403)
}

async function assertNoConflict(carId: string, familyId: string, startsAt: string, endsAt: string) {
  const db = serviceDb()
  const { data } = await db.from('bookings')
    .select('id')
    .eq('car_id', carId)
    .eq('family_id', familyId)
    .eq('status', 'active')
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt)
    .limit(1)
  if (data && data.length > 0) throw new AppError('Time slot conflicts with an existing booking', 409)
}

async function insertBooking(
  userId: string,
  body: {
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
  const { data, error } = await db.from('bookings').insert({
    family_id: body.family_id,
    car_id: body.car_id,
    booked_by: userId,
    starts_at: body.starts_at,
    ends_at: body.ends_at,
    description: body.description ?? null,
    pickup_address_id: body.pickup_address_id ?? null,
    dropoff_address_id: body.dropoff_address_id ?? null,
  }).select().single()
  if (error) throw new AppError(error.message)
  return data
}
