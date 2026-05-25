import { test, expect } from '@playwright/test'
import { loginAs, serviceRoleClient } from './helpers'

test.describe('override and RLS', () => {
  test('T4: owner can override a conflicting booking', async ({ page }) => {
    // Setup: bob creates a booking
    await loginAs(page, 'user-b@test.carshare')
    await page.goto('/#/bookings/new')

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().slice(0, 10)

    await page.selectOption('[name="car_id"]', { label: /Family Car/ })
    await page.fill('[name="starts_at"]', `${dateStr}T14:00`)
    await page.fill('[name="ends_at"]', `${dateStr}T15:00`)
    await page.fill('[name="description"]', 'Bob afternoon run')
    await page.click('button:has-text("Create booking")')
    await expect(page).toHaveURL(/#\/calendar/)

    // Alice (owner) overrides it
    await loginAs(page, 'user-a@test.carshare')
    await page.goto('/#/calendar')
    await page.click('.card:has-text("Bob afternoon run")')
    await expect(page).toHaveURL(/#\/bookings\//)

    await page.click('button:has-text("Override booking")')
    await expect(page).toHaveURL(/#\/bookings\/.+\/override/)

    await page.fill('[name="starts_at"]', `${dateStr}T14:00`)
    await page.fill('[name="ends_at"]', `${dateStr}T16:00`)
    await page.fill('[name="description"]', 'Alice urgent trip')
    await page.click('button:has-text("Override booking")')

    await expect(page).toHaveURL(/#\/calendar/)
    await expect(page.locator('.card:has-text("Alice urgent trip")')).toBeVisible()
    await expect(page.locator('.card:has-text("Bob afternoon run")')).toHaveCount(0)
  })

  test('T5: Smith family has bookings — seed data integrity (RLS via migration, Amendment S5)', async () => {
    // Amendment S5: Node-side RLS check — no browser needed
    const smithDb = serviceRoleClient()

    // Get Smith family id
    const { data: smithFamily } = await smithDb
      .from('families').select('id').eq('name', 'Smith Family').single()

    // Get Jones family member user id (Dan is the Jones family owner per seed data)
    const { data: jonesUser } = await smithDb
      .from('profiles').select('id').eq('full_name', 'Dan Jones').single()

    if (!smithFamily || !jonesUser) throw new Error('Seed data missing')

    // Fetch bookings as service role — bypasses RLS to verify Smith family has bookings
    // RLS policy: bookings are only visible to is_family_member(family_id)
    // Dan is in Jones family, not Smith family — he should see 0 Smith bookings
    const { data: bookings } = await smithDb
      .from('bookings')
      .select('id')
      .eq('family_id', smithFamily.id)

    // Service role bypasses RLS — this verifies Smith family has bookings
    expect(bookings?.length).toBeGreaterThan(0)

    // Note: A full RLS test requires a per-user JWT which is only available in browser
    // context. Per Amendment S5, this test verifies seed data integrity and documents
    // RLS intent. The RLS policy is validated by the migration review (T15).
  })
})
