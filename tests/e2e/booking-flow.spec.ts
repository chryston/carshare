import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('booking flow', () => {
  test('T1: member can create a booking', async ({ page }) => {
    await loginAs(page, 'user-b@test.carshare')
    await page.goto('/#/bookings/new')

    // Select the seeded car
    await page.selectOption('[name="car_id"]', { label: /Family Car/ })

    // Set times (tomorrow 10am–11am)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().slice(0, 10)
    await page.fill('[name="starts_at"]', `${dateStr}T10:00`)
    await page.fill('[name="ends_at"]', `${dateStr}T11:00`)
    await page.fill('[name="description"]', 'School run')

    await page.click('button:has-text("Create booking")')
    await expect(page).toHaveURL(/#\/calendar/)
    await expect(page.locator('.card')).toContainText('School run')
  })

  test('T2: conflicting booking is rejected', async ({ page }) => {
    await loginAs(page, 'user-a@test.carshare')
    await page.goto('/#/bookings/new')

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().slice(0, 10)

    await page.selectOption('[name="car_id"]', { label: /Family Car/ })
    await page.fill('[name="starts_at"]', `${dateStr}T10:30`)
    await page.fill('[name="ends_at"]', `${dateStr}T11:30`)

    await page.click('button:has-text("Create booking")')
    // Should stay on booking form with an error toast
    await expect(page).toHaveURL(/#\/bookings\/new/)
    await expect(page.locator('[aria-live="polite"]')).toContainText(/conflict/i)
  })

  test('T3: member can cancel their own booking', async ({ page }) => {
    await loginAs(page, 'user-b@test.carshare')

    // Navigate to the "School run" booking created in T1
    await page.click('.card:has-text("School run")')
    await expect(page).toHaveURL(/#\/bookings\//)

    await page.click('button:has-text("Cancel booking")')
    await expect(page).toHaveURL(/#\/calendar/)
    // The cancelled booking should no longer appear on calendar
    await expect(page.locator('.card:has-text("School run")')).toHaveCount(0)
  })
})
