import { Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

export async function loginAs(page: Page, email: string, password = 'testpassword123') {
  const url = process.env.VITE_SUPABASE_URL!
  const key = process.env.VITE_SUPABASE_ANON_KEY!
  const storageKey = process.env.SUPABASE_STORAGE_KEY!
  const baseURL = 'http://localhost:5173'

  // Ensure we're on the app origin so localStorage writes to the correct domain
  if (!page.url().startsWith(baseURL)) {
    await page.goto(baseURL)
  }

  const session = await page.evaluate(
    async ([supaUrl, supaKey, em, pw]: string[]) => {
      const r = await fetch(`${supaUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: supaKey },
        body: JSON.stringify({ email: em, password: pw }),
      })
      return r.json()
    },
    [url, key, email, password]
  )

  await page.evaluate(
    ([k, s]: [string, unknown]) => localStorage.setItem(k, JSON.stringify(s)),
    [storageKey, session]
  )
}

export function serviceRoleClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
