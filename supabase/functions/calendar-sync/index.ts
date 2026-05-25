import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { serviceDb } from '../_shared/db.ts'
import { corsHeaders, ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    return await handleCalendarSync(req)
  } catch (err) {
    return respondError(err)
  }
})

async function handleCalendarSync(req: Request): Promise<Response> {
  verifyCronSecret(req)
  const tokens = await fetchActiveTokens()
  let synced = 0
  for (const token of tokens) {
    try {
      await syncUserCalendar(token)
      synced++
    } catch (err) {
      console.error(`Calendar sync failed for user ${token.user_id}:`, err)
    }
  }
  return ok({ synced, total: tokens.length })
}

// Amendment A7: validate CRON_SECRET header
function verifyCronSecret(req: Request) {
  const expected = Deno.env.get('CRON_SECRET')
  if (!expected) return // allow in dev without secret
  const provided = req.headers.get('x-cron-secret')
  if (provided !== expected) throw new AppError('Unauthorized', 401)
}

async function fetchActiveTokens() {
  const db = serviceDb()
  const { data, error } = await db.from('google_calendar_tokens')
    .select('user_id, access_token, refresh_token, expires_at')
  if (error) throw new AppError(error.message)
  return data ?? []
}

async function syncUserCalendar(token: { user_id: string; access_token: string; refresh_token: string | null; expires_at: string }) {
  const freshToken = await ensureFreshToken(token)
  const bookings = await fetchUpcomingBookings(token.user_id)
  for (const booking of bookings) {
    await upsertCalendarEvent(freshToken, booking)
  }
}

// Amendment A9: refresh expired token and persist back to DB
async function ensureFreshToken(token: { user_id: string; access_token: string; refresh_token: string | null; expires_at: string }): Promise<string> {
  if (new Date(token.expires_at) > new Date(Date.now() + 60_000)) {
    return token.access_token // still valid (> 1 min remaining)
  }
  if (!token.refresh_token) throw new AppError(`No refresh token for user ${token.user_id}`)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
    }),
  })
  if (!res.ok) throw new AppError(`Token refresh failed: ${await res.text()}`)

  const refreshed = await res.json()
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

  // Persist refreshed token back to DB
  const db = serviceDb()
  await db.from('google_calendar_tokens').update({
    access_token: refreshed.access_token,
    expires_at: newExpiresAt,
  }).eq('user_id', token.user_id)

  return refreshed.access_token
}

async function fetchUpcomingBookings(userId: string) {
  const db = serviceDb()
  const now = new Date().toISOString()
  const weekOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db.from('bookings')
    .select('id, starts_at, ends_at, description, cars(make, model)')
    .eq('booked_by', userId)
    .eq('status', 'active')
    .gte('starts_at', now)
    .lte('starts_at', weekOut)
  if (error) throw new AppError(error.message)
  return data ?? []
}

async function upsertCalendarEvent(accessToken: string, booking: { id: string; starts_at: string; ends_at: string; description: string | null; cars: { make: string; model: string } | null }) {
  const event = {
    summary: `CarShare: ${booking.cars?.make ?? ''} ${booking.cars?.model ?? ''}`.trim(),
    description: booking.description ?? undefined,
    start: { dateTime: booking.starts_at },
    end: { dateTime: booking.ends_at },
    extendedProperties: { private: { carshare_booking_id: booking.id } },
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=0`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  )
  if (!res.ok) {
    const errText = await res.text()
    throw new AppError(`Google Calendar API error: ${errText}`)
  }
}
