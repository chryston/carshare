import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'

const TEST_USERS = [
  { email: 'user-a@test.carshare', password: 'testpassword123', fullName: 'Alice Smith' },
  { email: 'user-b@test.carshare', password: 'testpassword123', fullName: 'Bob Smith' },
  { email: 'user-c@test.carshare', password: 'testpassword123', fullName: 'Carol Smith' },
  { email: 'user-d@test.carshare', password: 'testpassword123', fullName: 'Dan Jones' },
]

export default async function globalSetup() {
  execSync('npm run db:reset', { stdio: 'inherit' })

  const admin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await Promise.all(TEST_USERS.map(u => createTestUser(admin, u)))

  await seedFamilyData(admin)
}

async function createTestUser(
  admin: ReturnType<typeof createClient>,
  user: { email: string; password: string; fullName: string }
) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  })
  if (error && !error.message.includes('already registered')) throw error
  return data
}

async function seedFamilyData(admin: ReturnType<typeof createClient>) {
  try {
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers()
    const alice = authUsers.find(u => u.email === 'user-a@test.carshare')!
    const bob = authUsers.find(u => u.email === 'user-b@test.carshare')!
    const carol = authUsers.find(u => u.email === 'user-c@test.carshare')!
    const dan = authUsers.find(u => u.email === 'user-d@test.carshare')!

    // Alice's family
    const { data: family, error: fErr } = await admin.from('families').insert({ name: 'Smith Family' }).select().single()
    if (fErr) {
      console.warn(`seedFamilyData: skipping (tables not yet created): ${fErr.message}`)
      return
    }

    await admin.from('family_members').insert([
      { family_id: family!.id, user_id: alice.id, role: 'owner', status: 'active', joined_at: new Date().toISOString() },
      { family_id: family!.id, user_id: bob.id, role: 'member', status: 'active', joined_at: new Date().toISOString() },
      { family_id: family!.id, user_id: carol.id, role: 'member', status: 'active', joined_at: new Date().toISOString() },
    ])

    // Dan's separate family (for RLS test T5)
    const { data: danFamily, error: dErr } = await admin.from('families').insert({ name: 'Jones Family' }).select().single()
    if (dErr) throw new Error(`Failed to create Jones Family: ${dErr.message}`)
    await admin.from('family_members').insert({
      family_id: danFamily!.id, user_id: dan.id, role: 'owner', status: 'active', joined_at: new Date().toISOString(),
    })

    // Address for Alice's family
    const { data: address, error: aErr } = await admin.from('addresses').insert({
      family_id: family!.id, label: 'Home', line1: '1 Test Street', city: 'London', postcode: 'SW1A 1AA', is_default: true,
    }).select().single()
    if (aErr) throw new Error(`Failed to create address: ${aErr.message}`)

    // Car for Alice's family
    const { error: cErr } = await admin.from('cars').insert({
      family_id: family!.id, name: 'Family Car', plate: 'TE57 CAR',
      current_address_id: address!.id,
    })
    if (cErr) throw new Error(`Failed to create car: ${cErr.message}`)
  } catch (err) {
    // Tables don't exist yet — migrations will be added in Tasks 5, 11, and 15
    console.warn('seedFamilyData: failed gracefully (expected before migrations):', (err as Error).message)
  }
}
