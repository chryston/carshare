import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  fullyParallel: false,
  globalSetup: './tests/e2e/globalSetup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
})
