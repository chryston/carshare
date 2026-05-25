import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std@0.168.0/encoding/hex.ts'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { corsHeaders, ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    return await handleInviteMember(req)
  } catch (err) {
    return respondError(err)
  }
})

async function handleInviteMember(req: Request): Promise<Response> {
  const inviter = await requireUser(req)
  const { family_id, email } = await parseBody(req)
  await assertIsOwner(inviter.id, family_id)
  const rawToken = generateRawToken()
  const tokenHash = await hashToken(rawToken)
  await upsertInvite(family_id, email, tokenHash)
  const inviteUrl = buildInviteUrl(rawToken)
  await sendInviteEmail(email, inviteUrl)
  return ok({ invite_url: inviteUrl })
}

async function parseBody(req: Request) {
  const body = await req.json()
  if (!body.family_id || !body.email) throw new AppError('family_id and email are required')
  return body as { family_id: string; email: string }
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
  if (!data) throw new AppError('Only owners can invite members', 403)
}

function generateRawToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return encodeHex(bytes)
}

async function hashToken(raw: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return encodeHex(new Uint8Array(hashBuffer))
}

async function upsertInvite(familyId: string, email: string, tokenHash: string) {
  const db = serviceDb()
  const expires = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

  // Amendment A3: select-then-insert/update pattern (no broken onConflict target)
  const { data: existing } = await db.from('family_members')
    .select('id')
    .eq('family_id', familyId)
    .eq('invited_email', email)
    .eq('status', 'pending')
    .single()

  if (existing) {
    const { error } = await db.from('family_members').update({
      invite_token_hash: tokenHash,
      invite_expires_at: expires,
    }).eq('id', existing.id)
    if (error) throw new AppError(error.message)
  } else {
    const { error } = await db.from('family_members').insert({
      family_id: familyId,
      invited_email: email,
      invite_token_hash: tokenHash,
      invite_expires_at: expires,
      role: 'member',
      status: 'pending',
    })
    if (error) throw new AppError(error.message)
  }
}

function buildInviteUrl(rawToken: string): string {
  const origin = Deno.env.get('SITE_ORIGIN') ?? 'http://localhost:5173'
  return `${origin}/#/accept-invite?token=${rawToken}`
}

async function sendInviteEmail(email: string, inviteUrl: string) {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.log(`[DEV] Invite URL for ${email}: ${inviteUrl}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'CarShare <noreply@carshare.app>',
      to: email,
      subject: "You've been invited to CarShare",
      html: `<p>Click to join: <a href="${inviteUrl}">${inviteUrl}</a></p>`,
    }),
  })
  if (!res.ok) throw new AppError(`Email send failed: ${await res.text()}`)
}
