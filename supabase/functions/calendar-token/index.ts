import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

serve(async (req) => {
  try {
    return await handleCalendarToken(req)
  } catch (err) {
    return respondError(err)
  }
})

async function handleCalendarToken(req: Request): Promise<Response> {
  const user = await requireUser(req)
  if (req.method === 'GET') return getToken(user.id)
  if (req.method === 'POST') return storeToken(req, user.id)
  if (req.method === 'DELETE') return deleteToken(user.id)
  throw new AppError('Method not allowed', 405)
}

async function getToken(userId: string): Promise<Response> {
  const db = serviceDb()
  const { data } = await db.from('google_calendar_tokens')
    .select('id, expires_at')
    .eq('user_id', userId)
    .single()
  return ok({ connected: !!data, expires_at: data?.expires_at ?? null })
}

async function storeToken(req: Request, userId: string): Promise<Response> {
  const { access_token, refresh_token, expires_at } = await req.json()
  if (!access_token || !expires_at) throw new AppError('access_token and expires_at are required')
  const db = serviceDb()
  const { error } = await db.from('google_calendar_tokens').upsert({
    user_id: userId,
    access_token,
    refresh_token: refresh_token ?? null,
    expires_at,
  }, { onConflict: 'user_id' })
  if (error) throw new AppError(error.message)
  return ok({ stored: true })
}

async function deleteToken(userId: string): Promise<Response> {
  const db = serviceDb()
  const { error } = await db.from('google_calendar_tokens')
    .delete()
    .eq('user_id', userId)
  if (error) throw new AppError(error.message)
  return ok({ deleted: true })
}
