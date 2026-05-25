import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AppError } from './errors.ts'

export async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new AppError('Missing Authorization header', 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !user) throw new AppError('Invalid or expired token', 401)
  return user
}
