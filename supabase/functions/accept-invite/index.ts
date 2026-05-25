import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std@0.168.0/encoding/hex.ts'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

serve(async (req) => {
  try {
    return await handleAcceptInvite(req)
  } catch (err) {
    return respondError(err)
  }
})

async function handleAcceptInvite(req: Request): Promise<Response> {
  const user = await requireUser(req)
  const { token } = await parseBody(req)
  const invite = await findValidInvite(token)
  await activateMembership(invite.id, user.id)
  return ok({ family_id: invite.family_id })
}

async function parseBody(req: Request) {
  const body = await req.json()
  if (!body.token) throw new AppError('token is required')
  return body as { token: string }
}

async function findValidInvite(rawToken: string) {
  const tokenHash = await hashToken(rawToken)
  const db = serviceDb()
  const { data, error } = await db.from('family_members')
    .select('id, family_id, invite_expires_at')
    .eq('invite_token_hash', tokenHash)
    .eq('status', 'pending')
    .single()
  if (error || !data) throw new AppError('Invalid or expired invite', 404)
  if (new Date(data.invite_expires_at) < new Date()) throw new AppError('Invite has expired', 410)
  return data
}

async function activateMembership(inviteId: string, userId: string) {
  const db = serviceDb()
  const { error } = await db.from('family_members').update({
    user_id: userId,
    status: 'active',
    joined_at: new Date().toISOString(),
    invite_token_hash: null,
    invite_expires_at: null,
  }).eq('id', inviteId)
  if (error) throw new AppError(error.message)
}

async function hashToken(raw: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return encodeHex(new Uint8Array(hashBuffer))
}
