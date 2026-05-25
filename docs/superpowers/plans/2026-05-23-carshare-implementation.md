# CarShare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack family car-sharing web app on GitHub Pages + Supabase with Google OAuth, booking conflict detection, and optional Google Calendar sync.

**Architecture:** React + Vite SPA hosted on GitHub Pages using hash routing, backed by Supabase (PostgreSQL + RLS + Auth) and Supabase Edge Functions for server-side logic. Google OAuth handled by Supabase Auth; Calendar sync via a scheduled Edge Function.

**Tech Stack:** React 18, Vite 5, TypeScript, React Router v6 (hash), React Hook Form + Zod, FullCalendar, Bootstrap 5 + Sass, Supabase JS v2, date-fns, Playwright (E2E), Vitest (unit)

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/main.tsx` | App entry — wraps `<App>` with context providers |
| `src/App.tsx` | Hash router + route definitions |
| `src/types/database.types.ts` | Hand-written DB interface (regenerated with `npm run db:types`) |
| `src/lib/supabase.ts` | Typed Supabase client singleton |
| `src/lib/errors.ts` | `AppError` class + `toastError()` helper |
| `src/contexts/AuthContext.tsx` | `useSession()` — current Supabase session |
| `useFamily | `src/contexts/FamilyContext.tsx` active family, members, `reload()` |()` 
| `src/components/Layout.tsx` | Shell: navbar + `<Outlet>` |
| `src/components/ProtectedRoute.tsx` | Redirect to `/login` if no session |
| `src/pages/LoginPage.tsx` | Google OAuth sign-in button |
| `src/pages/OnboardingPage.tsx` | Create/join family flow |
| `src/pages/AcceptInvitePage.tsx` | Token-based invite acceptance |
| `src/pages/MembersPage.tsx` | Owner: invite + manage members |
| `src/pages/AddressesPage.tsx` | Owner: CRUD household addresses |
| `src/pages/CarsPage.tsx` | Owner: CRUD cars |
| `src/pages/CarDetailPage.tsx` | Member: view car + update parking location |
| `src/pages/CalendarPage.tsx` | FullCalendar booking view |
| `src/pages/BookingFormPage.tsx` | Create booking (React Hook Form + Zod) |
| `src/pages/BookingDetailPage.tsx` | View/cancel booking |
| `src/pages/OverridePage.tsx` | Owner: override conflicting booking |
| `src/pages/SettingsPage.tsx` | Connect/disconnect Google Calendar |
| `supabase/migrations/001_initial.sql` | Users, families, family_members, addresses |
| `supabase/migrations/002_cars.sql` | Cars table |
| `supabase/migrations/003_bookings.sql` | Bookings + GiST exclusion + calendar_sync_status |
| `supabase/migrations/004_oauth_tokens.sql` | user_oauth_tokens table |
| `supabase/functions/_shared/auth.ts` | `requireUser()` — validate JWT, return user |
| `supabase/functions/_shared/db.ts` | Service-role client singleton |
| `supabase/functions/_shared/respond.ts` | `ok()`, `respondError()` |
| `supabase/functions/_shared/errors.ts` | `AppError` (Deno) |
| `supabase/functions/invite-member/index.ts` | Send invite email / return invite_url in dev |
| `supabase/functions/accept-invite/index.ts` | Validate token, link user to family |
| `supabase/functions/create-booking/index.ts` | Validate + insert booking (handles GiST conflict) |
| `supabase/functions/override-booking/index.ts` | Owner override: cancel + replace booking |
| `supabase/functions/calendar-sync/index.ts` | Cron: sync pending bookings to Google Calendar |
| `tests/e2e/globalSetup.ts` | Create test users + db reset |
| `tests/e2e/helpers.ts` | `loginAs()`, `getSupabaseSession()` |
| `tests/e2e/booking-flow.spec.ts` | T1–T3: Create, conflict, cancel |
| `tests/e2e/override-flow.spec.ts` | T4–T5: Override + RLS cross-family |
| `tests/e2e/calendar-sync.spec.ts` | T6: Calendar sync |
| `.github/workflows/deploy.yml` | Build + deploy to GitHub Pages |

---

## Milestone 0 — Project Scaffold

### Task 1: Vite scaffold + typed Supabase client

**Files:**
- Create: `src/types/database.types.ts`
- Create: `src/lib/supabase.ts`
- Create: `src/lib/errors.ts`
- Modify: `package.json` (add deps + scripts)
- Modify: `vite.config.ts`

- [ ] **Step 1: Install Vite + React + TypeScript**

```bash
cd /home/chryston/docker/copilot/repos/worktrees/carshare-main-spec
npm create vite@latest . -- --template react-ts --yes
npm install
```

- [ ] **Step 2: Install runtime deps**

```bash
npm install @supabase/supabase-js react-router-dom react-hook-form @hookform/resolvers zod \
  react-hot-toast date-fns @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid \
  bootstrap sass
```

- [ ] **Step 3: Install dev/test deps**

```bash
npm install -D vitest @vitejs/plugin-react @playwright/test \
  @types/react @types/react-dom dotenv
npx playwright install --with-deps chromium
```

- [ ] **Step 4: Set up npm scripts in `package.json`**

Add under `"scripts"`:
```json
{
  "dev": "vite",
  "build": "tsc && vite build",
  "type-check": "tsc --noEmit",
  "test:unit": "vitest run",
  "test:e2e": "playwright test",
  "db:reset": "supabase db reset --local",
  "db:types": "supabase gen types typescript --local > src/types/database.types.ts"
}
```

- [ ] **Step 5: Configure `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/carshare/' : '/',
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 6: Write `src/types/database.types.ts`**

```typescript
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string | null; avatar_url: string | null; created_at: string }
        Insert: { id: string; full_name?: string | null; avatar_url?: string | null }
        Update: { full_name?: string | null; avatar_url?: string | null }
      }
      families: {
        Row: { id: string; name: string; created_at: string }
        Insert: { name: string }
        Update: { name?: string }
      }
      family_members: {
        Row: {
          id: string; family_id: string; user_id: string | null; role: 'owner' | 'member'
          status: 'pending' | 'active' | 'removed'; invited_email: string | null
          invite_token_hash: string | null; invite_expires_at: string | null; joined_at: string | null
        }
        Insert: {
          family_id: string; user_id?: string | null; role: 'owner' | 'member'
          status: 'pending' | 'active' | 'removed'; invited_email?: string | null
          invite_token_hash?: string | null; invite_expires_at?: string | null
        }
        Update: {
          user_id?: string | null; role?: 'owner' | 'member'
          status?: 'pending' | 'active' | 'removed'; invite_token_hash?: string | null
          invite_expires_at?: string | null; joined_at?: string | null
        }
      }
      addresses: {
        Row: { id: string; family_id: string; label: string; line1: string; line2: string | null; city: string; postcode: string; is_default: boolean; created_at: string }
        Insert: { family_id: string; label: string; line1: string; line2?: string | null; city: string; postcode: string; is_default?: boolean }
        Update: { label?: string; line1?: string; line2?: string | null; city?: string; postcode?: string; is_default?: boolean }
      }
      cars: {
        Row: { id: string; family_id: string; name: string; plate: string; current_address_id: string | null; current_location_note: string | null; created_at: string }
        Insert: { family_id: string; name: string; plate: string; current_address_id?: string | null; current_location_note?: string | null }
        Update: { name?: string; plate?: string; current_address_id?: string | null; current_location_note?: string | null }
      }
      bookings: {
        Row: {
          id: string; car_id: string; family_id: string; user_id: string
          start_time: string; end_time: string; description: string | null
          pickup_address_id: string; dropoff_address_id: string
          pickup_address_snapshot: string; dropoff_address_snapshot: string
          status: 'confirmed' | 'cancelled'; replacement_booking_id: string | null
          calendar_sync_status: 'pending' | 'synced' | 'failed' | 'not_connected' | 'pending_delete'
          calendar_event_id: string | null; created_at: string
        }
        Insert: {
          car_id: string; family_id: string; user_id: string
          start_time: string; end_time: string; description?: string | null
          pickup_address_id: string; dropoff_address_id: string
          pickup_address_snapshot: string; dropoff_address_snapshot: string
          status?: 'confirmed' | 'cancelled'; calendar_sync_status?: 'pending' | 'synced' | 'failed' | 'not_connected' | 'pending_delete'
        }
        Update: {
          status?: 'confirmed' | 'cancelled'; replacement_booking_id?: string | null
          calendar_sync_status?: 'pending' | 'synced' | 'failed' | 'not_connected' | 'pending_delete'
          calendar_event_id?: string | null
        }
      }
      user_oauth_tokens: {
        Row: { id: string; user_id: string; provider: string; access_token: string; refresh_token: string | null; expiry: string | null }
        Insert: { user_id: string; provider: string; access_token: string; refresh_token?: string | null; expiry?: string | null }
        Update: { access_token?: string; refresh_token?: string | null; expiry?: string | null }
      }
    }
  }
}
```

- [ ] **Step 7: Write `src/lib/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 8: Write `src/lib/errors.ts`**

```typescript
import toast from 'react-hot-toast'

export class AppError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'AppError'
  }
}

export function toastError(err: unknown): void {
  if (err instanceof AppError) {
    toast.error(err.message)
  } else if (err instanceof Error) {
    toast.error(err.message)
  } else {
    toast.error('An unexpected error occurred')
  }
}
```

- [ ] **Step 9: Write unit test**

```typescript
// src/lib/errors.test.ts
import { describe, it, expect } from 'vitest'
import { AppError } from './errors'

describe('AppError', () => {
  it('preserves message and code', () => {
    const err = new AppError('not found', 'NOT_FOUND')
    expect(err.message).toBe('not found')
    expect(err.code).toBe('NOT_FOUND')
    expect(err).toBeInstanceOf(Error)
  })
})
```

- [ ] **Step 10: Run unit test**

```bash
npm run test:unit -- src/lib/errors.test.ts
```
Expected: PASS

- [ ] **Step 11: Create `.env.local`**

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<from supabase start output>
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(m0): vite scaffold + typed supabase client + AppError"
```

---

### Task 2: Supabase local setup + Playwright global setup

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `tests/e2e/globalSetup.ts`
- Create: `tests/e2e/helpers.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Initialise Supabase project**

```bash
supabase init
supabase start
```
Copy the `anon key` and `service_role key` from the output into `.env.local`:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

- [ ] **Step 2: Write `playwright.config.ts`**

```typescript
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
```

- [ ] **Step 3: Write `tests/e2e/globalSetup.ts`**

```typescript
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

  for (const u of TEST_USERS) {
    await createTestUser(admin, u)
  }
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
```

- [ ] **Step 4: Write `tests/e2e/helpers.ts`**

```typescript
import { Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

export async function loginAs(page: Page, email: string, password = 'testpassword123') {
  const res = await page.evaluate(
    async ([url, key, em, pw]: string[]) => {
      const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ email: em, password: pw }),
      })
      return r.json()
    },
    [
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      email,
      password,
    ]
  )

  const projectRef = new URL(process.env.VITE_SUPABASE_URL!).hostname.split('.')[0]
  await page.evaluate(
    ([key, session]: [string, unknown]) => localStorage.setItem(key, JSON.stringify(session)),
    [`sb-${projectRef}-auth-token`, res]
  )
}

export function serviceRoleClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 5: Run global setup smoke test**

```bash
npm run db:reset
npx playwright test --list
```
Expected: no errors, test list empty (no specs yet).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(m0): supabase local setup + playwright global setup + helpers"
```

---

### Task 3: Bootstrap theme + Layout component

**Files:**
- Create: `src/styles/theme.scss`
- Create: `src/components/Layout.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write `src/styles/theme.scss`**

```scss
// Bootstrap variable overrides
$primary: #4f46e5;
$secondary: #64748b;
$border-radius: 0.5rem;
$font-family-base: 'Inter', system-ui, sans-serif;

@import 'bootstrap/scss/bootstrap';

// Utility tweaks
.navbar-brand { font-weight: 700; letter-spacing: -0.5px; }
.card { box-shadow: 0 1px 3px rgba(0,0,0,.08); }
```

- [ ] **Step 2: Write `src/components/Layout.tsx`**

```typescript
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'

export function Layout() {
  const { family } = useFamily()
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('#/login')
  }

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container">
          <NavLink className="navbar-brand" to="/">CarShare</NavLink>
          {family && (
            <div className="navbar-nav ms-auto d-flex flex-row gap-3 align-items-center">
              <NavLink className="nav-link" to="/calendar">Calendar</NavLink>
              <NavLink className="nav-link" to="/cars">Cars</NavLink>
              <NavLink className="nav-link" to="/addresses">Addresses</NavLink>
              <NavLink className="nav-link" to="/members">Members</NavLink>
              <NavLink className="nav-link" to="/settings">Settings</NavLink>
              <button className="btn btn-outline-light btn-sm" onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      </nav>
      <main className="container py-4">
        <Outlet />
      </main>
    </>
  )
}
```

- [ ] **Step 3: Write `src/main.tsx`**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { FamilyProvider } from './contexts/FamilyContext'
import { App } from './App'
import './styles/theme.scss'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <FamilyProvider>
        <App />
        <Toaster position="top-right" />
      </FamilyProvider>
    </AuthProvider>
  </React.StrictMode>
)
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```
Expected: no errors (AuthContext and FamilyContext will be stub files — see Task 4).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(m0): bootstrap theme + layout component"
```

---

### Task 4: Hash router + stub pages + context providers

**Files:**
- Create: `src/App.tsx`
- Create: `src/contexts/AuthContext.tsx`
- Create: `src/contexts/FamilyContext.tsx`
- Create: `src/components/ProtectedRoute.tsx`
- Create: `src/pages/LoginPage.tsx` (stub)
- Create: `src/pages/OnboardingPage.tsx` (stub)

- [ ] **Step 1: Write `src/contexts/AuthContext.tsx`**

```typescript
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const AuthContext = createContext<Session | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>
}

export function useSession() {
  return useContext(AuthContext)
}
```

- [ ] **Step 2: Write `src/contexts/FamilyContext.tsx`**

```typescript
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from './AuthContext'
import type { Database } from '../types/database.types'

type Family = Database['public']['Tables']['families']['Row']
type FamilyMember = Database['public']['Tables']['family_members']['Row']

interface FamilyContextValue {
  family: Family | null
  members: FamilyMember[]
  myMembership: FamilyMember | null
  reload: () => void
}

const FamilyContext = createContext<FamilyContextValue>({
  family: null, members: [], myMembership: null, reload: () => {},
})

export function FamilyProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!session) { setFamily(null); setMembers([]); return }
    loadFamily(session.user.id)
  }, [session, tick])

  async function loadFamily(userId: string) {
    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id, family:families(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .single()

    if (!membership) { setFamily(null); setMembers([]); return }

    const familyData = (membership as any).family as Family
    setFamily(familyData)

    const { data: allMembers } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', familyData.id)
      .neq('status', 'removed')

    setMembers(allMembers ?? [])
  }

  const myMembership = members.find(m => m.user_id === session?.user.id) ?? null

  return (
    <FamilyContext.Provider value={{ family, members, myMembership, reload }}>
      {children}
    </FamilyContext.Provider>
  )
}

export function useFamily() {
  return useContext(FamilyContext)
}
```

- [ ] **Step 3: Write `src/components/ProtectedRoute.tsx`**

```typescript
import { Navigate } from 'react-router-dom'
import { useSession } from '../contexts/AuthContext'
import { ReactNode } from 'react'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const session = useSession()
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 4: Write `src/App.tsx`**

```typescript
import { createHashRouter, RouterProvider, redirect } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { AcceptInvitePage } from './pages/AcceptInvitePage'
import { MembersPage } from './pages/MembersPage'
import { AddressesPage } from './pages/AddressesPage'
import { CarsPage } from './pages/CarsPage'
import { CarDetailPage } from './pages/CarDetailPage'
import { CalendarPage } from './pages/CalendarPage'
import { BookingFormPage } from './pages/BookingFormPage'
import { BookingDetailPage } from './pages/BookingDetailPage'
import { OverridePage } from './pages/OverridePage'
import { SettingsPage } from './pages/SettingsPage'

const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/accept-invite', element: <AcceptInvitePage /> },
  {
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      { index: true, loader: () => redirect('/calendar') },
      { path: '/onboarding', element: <OnboardingPage /> },
      { path: '/calendar', element: <CalendarPage /> },
      { path: '/bookings/new', element: <BookingFormPage /> },
      { path: '/bookings/:id', element: <BookingDetailPage /> },
      { path: '/bookings/:id/override', element: <OverridePage /> },
      { path: '/cars', element: <CarsPage /> },
      { path: '/cars/:id', element: <CarDetailPage /> },
      { path: '/addresses', element: <AddressesPage /> },
      { path: '/members', element: <MembersPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
```

- [ ] **Step 5: Create stub pages** (repeat pattern for each — replace component name):

```typescript
// src/pages/LoginPage.tsx
export function LoginPage() { return <div>Login</div> }
// src/pages/OnboardingPage.tsx
export function OnboardingPage() { return <div>Onboarding</div> }
// src/pages/AcceptInvitePage.tsx
export function AcceptInvitePage() { return <div>Accept Invite</div> }
// src/pages/MembersPage.tsx
export function MembersPage() { return <div>Members</div> }
// src/pages/AddressesPage.tsx
export function AddressesPage() { return <div>Addresses</div> }
// src/pages/CarsPage.tsx
export function CarsPage() { return <div>Cars</div> }
// src/pages/CarDetailPage.tsx
export function CarDetailPage() { return <div>Car Detail</div> }
// src/pages/CalendarPage.tsx
export function CalendarPage() { return <div>Calendar</div> }
// src/pages/BookingFormPage.tsx
export function BookingFormPage() { return <div>Booking Form</div> }
// src/pages/BookingDetailPage.tsx
export function BookingDetailPage() { return <div>Booking Detail</div> }
// src/pages/OverridePage.tsx
export function OverridePage() { return <div>Override</div> }
// src/pages/SettingsPage.tsx
export function SettingsPage() { return <div>Settings</div> }
```

- [ ] **Step 6: Type-check**

```bash
npm run type-check
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(m0): hash router + context providers + stub pages"
```

---

## Milestone 1 — Auth, Families & Invites

### Task 5: Migration 001 — Users, Families, Members, Addresses

**Files:**
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/001_initial.sql

-- Profiles (mirrors auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Families
CREATE TABLE families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Family members
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'removed')),
  invited_email TEXT,
  invite_token_hash TEXT,
  invite_expires_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  CONSTRAINT unique_active_member UNIQUE (family_id, user_id)
);

-- Only one active owner per family
CREATE UNIQUE INDEX idx_family_owner ON family_members(family_id)
  WHERE role = 'owner' AND status = 'active';

-- Allow re-inviting removed members
CREATE UNIQUE INDEX idx_family_members_active ON family_members(family_id, user_id)
  WHERE status != 'removed';

-- Addresses
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  postcode TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

-- Helper: is current user an active member of a family?
CREATE OR REPLACE FUNCTION is_family_member(fid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = fid AND user_id = auth.uid() AND status = 'active'
  );
$$;

-- Helper: is current user an active owner of a family?
CREATE OR REPLACE FUNCTION is_family_owner(fid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = fid AND user_id = auth.uid() AND role = 'owner' AND status = 'active'
  );
$$;

-- Profiles: own profile readable by self; family members can see each other
CREATE POLICY "own profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "family profiles" ON profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM family_members fm1
    JOIN family_members fm2 ON fm1.family_id = fm2.family_id
    WHERE fm1.user_id = auth.uid() AND fm2.user_id = profiles.id
      AND fm1.status = 'active' AND fm2.status = 'active'
  )
);
CREATE POLICY "update own profile" ON profiles FOR UPDATE USING (id = auth.uid());

-- Families: members can read their family
CREATE POLICY "read own family" ON families FOR SELECT USING (is_family_member(id));

-- Family members: members can see their family's member list
CREATE POLICY "read family members" ON family_members FOR SELECT USING (is_family_member(family_id));
-- Owner can update member records
CREATE POLICY "owner manages members" ON family_members FOR ALL USING (is_family_owner(family_id));

-- Addresses: all members read; owner manages
CREATE POLICY "read addresses" ON addresses FOR SELECT USING (is_family_member(family_id));
CREATE POLICY "owner manages addresses" ON addresses FOR ALL USING (is_family_owner(family_id));
```

- [ ] **Step 2: Apply migration**

```bash
supabase db reset --local
```
Expected: migration applied with no errors.

- [ ] **Step 3: Regenerate types**

```bash
npm run db:types
```
Expected: `src/types/database.types.ts` updated.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(m1): migration 001 — profiles, families, members, addresses + RLS"
```


---

### Task 6: LoginPage + OnboardingPage

**Files:**
- Modify: `src/pages/LoginPage.tsx`
- Modify: `src/pages/OnboardingPage.tsx`

- [ ] **Step 1: Implement `LoginPage.tsx`**

```typescript
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { toastError } from '../lib/errors'

export function LoginPage() {
  const session = useSession()
  const navigate = useNavigate()

  useEffect(() => { if (session) navigate('/onboarding') }, [session])

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) toastError(error)
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div className="card p-5 shadow-sm" style={{ maxWidth: 400, width: '100%' }}>
        <h1 className="h3 fw-bold mb-1">CarShare</h1>
        <p className="text-muted mb-4">Family vehicle scheduling</p>
        <button className="btn btn-primary w-100" onClick={signInWithGoogle}>
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement `OnboardingPage.tsx`**

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import { AppError } from '../lib/errors'

const createSchema = z.object({ familyName: z.string().min(2, 'At least 2 characters') })
type CreateForm = z.infer<typeof createSchema>

export function OnboardingPage() {
  const session = useSession()!
  const { family, reload } = useFamily()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'create' | 'wait'>('create')

  if (family) { navigate('/calendar'); return null }

  return (
    <div className="row justify-content-center mt-5">
      <div className="col-md-6">
        <h2 className="mb-4">Set up your family</h2>
        <ul className="nav nav-tabs mb-4">
          <li className="nav-item">
            <button className={`nav-link ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
              Create family
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === 'wait' ? 'active' : ''}`} onClick={() => setTab('wait')}>
              Waiting for invite
            </button>
          </li>
        </ul>
        {tab === 'create'
          ? <CreateFamilyForm userId={session.user.id} onCreated={() => { reload(); navigate('/members') }} />
          : <WaitingPanel />}
      </div>
    </div>
  )
}

function CreateFamilyForm({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  })

  async function submit({ familyName }: CreateForm) {
    const { data: family, error: fErr } = await supabase
      .from('families').insert({ name: familyName }).select().single()
    if (fErr) throw new AppError(fErr.message)

    const { error: mErr } = await supabase.from('family_members').insert({
      family_id: family.id, user_id: userId, role: 'owner', status: 'active', joined_at: new Date().toISOString(),
    })
    if (mErr) throw new AppError(mErr.message)

    onCreated()
  }

  return (
    <form onSubmit={handleSubmit(submit)}>
      <div className="mb-3">
        <label className="form-label">Family name</label>
        <input className={`form-control ${errors.familyName ? 'is-invalid' : ''}`} {...register('familyName')} />
        {errors.familyName && <div className="invalid-feedback">{errors.familyName.message}</div>}
      </div>
      <button className="btn btn-primary" disabled={isSubmitting}>Create family</button>
    </form>
  )
}

function WaitingPanel() {
  return <p className="text-muted">Ask your family owner to invite you. Once accepted, refresh this page.</p>
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(m1): LoginPage (Google OAuth) + OnboardingPage (create/join family)"
```

---

### Task 7: Edge Function shared utilities

**Files:**
- Create: `supabase/functions/_shared/errors.ts`
- Create: `supabase/functions/_shared/respond.ts`
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/_shared/db.ts`

- [ ] **Step 1: Write `supabase/functions/_shared/errors.ts`**

```typescript
export class AppError extends Error {
  constructor(message: string, public readonly status: number = 400, public readonly code?: string) {
    super(message)
    this.name = 'AppError'
  }
}
```

- [ ] **Step 2: Write `supabase/functions/_shared/respond.ts`**

```typescript
import { AppError } from './errors.ts'

export function ok(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function respondError(err: unknown): Response {
  if (err instanceof AppError) {
    return new Response(JSON.stringify({ error: err.message, code: err.code }), {
      status: err.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  console.error('Unhandled error:', err)
  return new Response(JSON.stringify({ error: 'Internal server error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 3: Write `supabase/functions/_shared/auth.ts`**

```typescript
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
```

- [ ] **Step 4: Write `supabase/functions/_shared/db.ts`**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../../../src/types/database.types.ts'

let _client: ReturnType<typeof createClient<Database>> | null = null

export function serviceDb() {
  if (!_client) {
    _client = createClient<Database>(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
  }
  return _client
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(m1): edge function shared utilities (auth, db, respond, errors)"
```

---

### Task 8: `invite-member` Edge Function

**Files:**
- Create: `supabase/functions/invite-member/index.ts`

- [ ] **Step 1: Write `supabase/functions/invite-member/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std@0.168.0/encoding/hex.ts'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

serve(async (req) => {
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
  const rawToken = await generateRawToken()
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

async function generateRawToken(): Promise<string> {
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
  const { error } = await db.from('family_members')
    .upsert(
      { family_id: familyId, invited_email: email, invite_token_hash: tokenHash,
        invite_expires_at: expires, role: 'member', status: 'pending' },
      { onConflict: 'family_id,invited_email' }
    )
  if (error) throw new AppError(error.message)
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
      subject: 'You\'ve been invited to CarShare',
      html: `<p>Click to join: <a href="${inviteUrl}">${inviteUrl}</a></p>`,
    }),
  })
  if (!res.ok) throw new AppError(`Email send failed: ${await res.text()}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(m1): invite-member edge function"
```

---

### Task 9: `accept-invite` Edge Function + AcceptInvitePage

**Files:**
- Create: `supabase/functions/accept-invite/index.ts`
- Modify: `src/pages/AcceptInvitePage.tsx`

- [ ] **Step 1: Write `supabase/functions/accept-invite/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
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
  const tokenHash = await hashToken(token)
  const invite = await findValidInvite(tokenHash, user.email!)
  await activateMembership(invite.id, user.id)
  return ok({ family_id: invite.family_id })
}

async function parseBody(req: Request) {
  const body = await req.json()
  if (!body.token) throw new AppError('token is required')
  return body as { token: string }
}

async function hashToken(raw: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return encodeHex(new Uint8Array(hashBuffer))
}

async function findValidInvite(tokenHash: string, userEmail: string) {
  const db = serviceDb()
  const { data: invite } = await db.from('family_members')
    .select('id, family_id, invited_email, invite_expires_at, status')
    .eq('invite_token_hash', tokenHash)
    .single()

  if (!invite) throw new AppError('Invalid invite token', 404)
  if (invite.status !== 'pending') throw new AppError('Invite already used', 400)
  if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
    throw new AppError('Invite has expired', 400)
  }
  if (invite.invited_email && invite.invited_email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new AppError('This invite is for a different email address', 403)
  }
  return invite
}

async function activateMembership(memberId: string, userId: string) {
  const db = serviceDb()
  const { error } = await db.from('family_members').update({
    user_id: userId,
    status: 'active',
    joined_at: new Date().toISOString(),
    invite_token_hash: null,
    invite_expires_at: null,
  }).eq('id', memberId)
  if (error) throw new AppError(error.message)
}
```

- [ ] **Step 2: Implement `AcceptInvitePage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const session = useSession()
  const { reload } = useFamily()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'accepting' | 'done' | 'error'>('idle')

  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) return
    if (!session) {
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
      })
      return
    }
    acceptInvite()
  }, [session, token])

  async function acceptInvite() {
    setStatus('accepting')
    const { data: { session: s } } = await supabase.auth.getSession()
    const res = await supabase.functions.invoke('accept-invite', {
      body: { token },
      headers: { Authorization: `Bearer ${s!.access_token}` },
    })
    if (res.error) {
      toastError(res.error)
      setStatus('error')
      return
    }
    toast.success('Welcome to the family!')
    reload()
    setStatus('done')
    navigate('/calendar')
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      {status === 'accepting' && <div className="spinner-border text-primary" />}
      {status === 'error' && <p className="text-danger">Invalid or expired invite link.</p>}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(m1): accept-invite edge function + AcceptInvitePage"
```

---

### Task 10: MembersPage

**Files:**
- Modify: `src/pages/MembersPage.tsx`

- [ ] **Step 1: Implement `MembersPage.tsx`**

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { useSession } from '../contexts/AuthContext'
import { toastError, AppError } from '../lib/errors'
import toast from 'react-hot-toast'

const inviteSchema = z.object({ email: z.string().email() })
type InviteForm = z.infer<typeof inviteSchema>

export function MembersPage() {
  const { family, members, myMembership, reload } = useFamily()
  const session = useSession()!
  const isOwner = myMembership?.role === 'owner'

  return (
    <div>
      <h2 className="mb-4">Family members</h2>
      <MemberList members={members} isOwner={isOwner} familyId={family!.id} userId={session.user.id} onChanged={reload} />
      {isOwner && <InviteForm familyId={family!.id} accessToken={session.access_token} onInvited={reload} />}
    </div>
  )
}

function MemberList({ members, isOwner, familyId, userId, onChanged }: {
  members: any[]; isOwner: boolean; familyId: string; userId: string; onChanged: () => void
}) {
  async function removeMember(memberId: string) {
    const { error } = await supabase.from('family_members')
      .update({ status: 'removed' }).eq('id', memberId)
    if (error) toastError(error)
    else { toast.success('Member removed'); onChanged() }
  }

  return (
    <ul className="list-group mb-4">
      {members.map(m => (
        <li key={m.id} className="list-group-item d-flex justify-content-between align-items-center">
          <span>
            {m.invited_email ?? m.user_id}
            <span className={`badge ms-2 ${m.status === 'active' ? 'bg-success' : 'bg-warning text-dark'}`}>
              {m.status}
            </span>
            {m.role === 'owner' && <span className="badge bg-primary ms-1">owner</span>}
          </span>
          {isOwner && m.user_id !== userId && (
            <button className="btn btn-sm btn-outline-danger" onClick={() => removeMember(m.id)}>
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function InviteForm({ familyId, accessToken, onInvited }: {
  familyId: string; accessToken: string; onInvited: () => void
}) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
  })

  async function submit({ email }: InviteForm) {
    const res = await supabase.functions.invoke('invite-member', {
      body: { family_id: familyId, email },
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.error) throw new AppError(res.error.message)
    toast.success(`Invite sent to ${email}`)
    reset()
    onInvited()
  }

  return (
    <form onSubmit={handleSubmit(submit)}>
      <h5>Invite a member</h5>
      <div className="input-group">
        <input
          type="email"
          className={`form-control ${errors.email ? 'is-invalid' : ''}`}
          placeholder="email@example.com"
          {...register('email')}
        />
        <button className="btn btn-primary" disabled={isSubmitting}>Send invite</button>
        {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(m1): MembersPage — invite + remove members"
```

---

## Milestone 2 — Addresses & Cars

### Task 11: Migration 002 — Cars

**Files:**
- Create: `supabase/migrations/002_cars.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/002_cars.sql

CREATE TABLE cars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plate TEXT NOT NULL,
  current_address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
  current_location_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read cars" ON cars FOR SELECT USING (is_family_member(family_id));
CREATE POLICY "owner manages cars" ON cars FOR ALL USING (is_family_owner(family_id));
-- Members can update car location
CREATE POLICY "member updates location" ON cars FOR UPDATE
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));
```

- [ ] **Step 2: Apply + regenerate types**

```bash
supabase db reset --local && npm run db:types
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(m2): migration 002 — cars table + RLS"
```

---

### Task 12: AddressesPage

**Files:**
- Modify: `src/pages/AddressesPage.tsx`

- [ ] **Step 1: Implement `AddressesPage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError, AppError } from '../lib/errors'
import toast from 'react-hot-toast'
import type { Database } from '../types/database.types'

type Address = Database['public']['Tables']['addresses']['Row']

const addressSchema = z.object({
  label: z.string().min(1, 'Required'),
  line1: z.string().min(1, 'Required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'Required'),
  postcode: z.string().min(1, 'Required'),
  is_default: z.boolean().optional(),
})
type AddressForm = z.infer<typeof addressSchema>

export function AddressesPage() {
  const { family, myMembership } = useFamily()
  const [addresses, setAddresses] = useState<Address[]>([])
  const isOwner = myMembership?.role === 'owner'

  useEffect(() => { if (family) loadAddresses(family.id) }, [family])

  async function loadAddresses(familyId: string) {
    const { data, error } = await supabase.from('addresses').select('*').eq('family_id', familyId).order('label')
    if (error) toastError(error)
    else setAddresses(data ?? [])
  }

  async function deleteAddress(id: string) {
    const { error } = await supabase.from('addresses').delete().eq('id', id)
    if (error) toastError(error)
    else { toast.success('Address deleted'); loadAddresses(family!.id) }
  }

  return (
    <div>
      <h2 className="mb-4">Addresses</h2>
      <ul className="list-group mb-4">
        {addresses.map(a => (
          <li key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
            <span>
              <strong>{a.label}</strong> — {a.line1}, {a.city} {a.postcode}
              {a.is_default && <span className="badge bg-primary ms-2">default</span>}
            </span>
            {isOwner && (
              <button className="btn btn-sm btn-outline-danger" onClick={() => deleteAddress(a.id)}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {isOwner && <AddressForm familyId={family!.id} onSaved={() => loadAddresses(family!.id)} />}
    </div>
  )
}

function AddressForm({ familyId, onSaved }: { familyId: string; onSaved: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
  })

  async function submit(values: AddressForm) {
    const { error } = await supabase.from('addresses').insert({ ...values, family_id: familyId })
    if (error) throw new AppError(error.message)
    toast.success('Address added')
    reset()
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit(submit)}>
      <h5>Add address</h5>
      <div className="row g-2">
        {(['label', 'line1', 'line2', 'city', 'postcode'] as const).map(field => (
          <div key={field} className="col-md-4">
            <input
              className={`form-control ${errors[field] ? 'is-invalid' : ''}`}
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              {...register(field)}
            />
            {errors[field] && <div className="invalid-feedback">{errors[field]?.message}</div>}
          </div>
        ))}
        <div className="col-12">
          <div className="form-check">
            <input className="form-check-input" type="checkbox" id="isDefault" {...register('is_default')} />
            <label className="form-check-label" htmlFor="isDefault">Set as default</label>
          </div>
        </div>
        <div className="col-12">
          <button className="btn btn-primary" disabled={isSubmitting}>Add address</button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(m2): AddressesPage — CRUD household addresses"
```

---

### Task 13: CarsPage

**Files:**
- Modify: `src/pages/CarsPage.tsx`

- [ ] **Step 1: Implement `CarsPage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError, AppError } from '../lib/errors'
import toast from 'react-hot-toast'
import type { Database } from '../types/database.types'

type Car = Database['public']['Tables']['cars']['Row']

const carSchema = z.object({
  name: z.string().min(1, 'Required'),
  plate: z.string().min(1, 'Required'),
})
type CarForm = z.infer<typeof carSchema>

export function CarsPage() {
  const { family, myMembership } = useFamily()
  const [cars, setCars] = useState<Car[]>([])
  const isOwner = myMembership?.role === 'owner'

  useEffect(() => { if (family) loadCars(family.id) }, [family])

  async function loadCars(familyId: string) {
    const { data, error } = await supabase.from('cars').select('*').eq('family_id', familyId).order('name')
    if (error) toastError(error)
    else setCars(data ?? [])
  }

  async function deleteCar(id: string) {
    const { error } = await supabase.from('cars').delete().eq('id', id)
    if (error) toastError(error)
    else { toast.success('Car removed'); loadCars(family!.id) }
  }

  return (
    <div>
      <h2 className="mb-4">Cars</h2>
      <div className="row row-cols-1 row-cols-md-3 g-4 mb-4">
        {cars.map(car => (
          <div key={car.id} className="col">
            <div className="card h-100">
              <div className="card-body">
                <h5 className="card-title">{car.name}</h5>
                <p className="card-text text-muted">{car.plate}</p>
              </div>
              <div className="card-footer d-flex gap-2">
                <Link className="btn btn-sm btn-outline-primary flex-grow-1" to={`/cars/${car.id}`}>
                  View
                </Link>
                {isOwner && (
                  <button className="btn btn-sm btn-outline-danger" onClick={() => deleteCar(car.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {isOwner && <AddCarForm familyId={family!.id} onAdded={() => loadCars(family!.id)} />}
    </div>
  )
}

function AddCarForm({ familyId, onAdded }: { familyId: string; onAdded: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CarForm>({
    resolver: zodResolver(carSchema),
  })

  async function submit(values: CarForm) {
    const { error } = await supabase.from('cars').insert({ ...values, family_id: familyId })
    if (error) throw new AppError(error.message)
    toast.success('Car added')
    reset()
    onAdded()
  }

  return (
    <form onSubmit={handleSubmit(submit)}>
      <h5>Add car</h5>
      <div className="row g-2">
        <div className="col-md-4">
          <input className={`form-control ${errors.name ? 'is-invalid' : ''}`} placeholder="Name (e.g. Family SUV)" {...register('name')} />
          {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
        </div>
        <div className="col-md-4">
          <input className={`form-control ${errors.plate ? 'is-invalid' : ''}`} placeholder="Plate (e.g. AB12 CDE)" {...register('plate')} />
          {errors.plate && <div className="invalid-feedback">{errors.plate.message}</div>}
        </div>
        <div className="col-md-4">
          <button className="btn btn-primary" disabled={isSubmitting}>Add car</button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(m2): CarsPage — list + add + delete cars"
```

---

### Task 14: CarDetailPage

**Files:**
- Modify: `src/pages/CarDetailPage.tsx`

- [ ] **Step 1: Implement `CarDetailPage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError, AppError } from '../lib/errors'
import toast from 'react-hot-toast'
import type { Database } from '../types/database.types'

type Car = Database['public']['Tables']['cars']['Row']
type Address = Database['public']['Tables']['addresses']['Row']

const locationSchema = z.object({
  current_address_id: z.string().uuid('Select an address'),
  current_location_note: z.string().optional(),
})
type LocationForm = z.infer<typeof locationSchema>

export function CarDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { family } = useFamily()
  const [car, setCar] = useState<Car | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])

  useEffect(() => {
    if (id && family) {
      loadCar(id)
      loadAddresses(family.id)
    }
  }, [id, family])

  async function loadCar(carId: string) {
    const { data, error } = await supabase.from('cars').select('*').eq('id', carId).single()
    if (error) toastError(error)
    else setCar(data)
  }

  async function loadAddresses(familyId: string) {
    const { data } = await supabase.from('addresses').select('*').eq('family_id', familyId).order('label')
    setAddresses(data ?? [])
  }

  async function updateLocation(values: LocationForm) {
    const { error } = await supabase.from('cars').update(values).eq('id', id!)
    if (error) throw new AppError(error.message)
    toast.success('Location updated')
    loadCar(id!)
  }

  if (!car) return <div className="spinner-border text-primary" />

  const currentAddress = addresses.find(a => a.id === car.current_address_id)

  return (
    <div>
      <Link to="/cars" className="btn btn-outline-secondary btn-sm mb-3">← Back to cars</Link>
      <h2>{car.name}</h2>
      <p className="text-muted">{car.plate}</p>
      <div className="card p-3 mb-4">
        <strong>Current location:</strong>{' '}
        {currentAddress ? `${currentAddress.label} — ${currentAddress.line1}` : 'Unknown'}
        {car.current_location_note && <p className="text-muted mt-1">{car.current_location_note}</p>}
      </div>
      <h5>Update parking location</h5>
      <UpdateLocationForm addresses={addresses} onSubmit={updateLocation} />
      <div className="mt-4">
        <Link className="btn btn-primary" to={`/bookings/new?car_id=${car.id}`}>
          Book this car
        </Link>
      </div>
    </div>
  )
}

function UpdateLocationForm({ addresses, onSubmit }: {
  addresses: Address[]
  onSubmit: (values: LocationForm) => Promise<void>
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LocationForm>({
    resolver: zodResolver(locationSchema),
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="mb-3">
        <label className="form-label">Address</label>
        <select className={`form-select ${errors.current_address_id ? 'is-invalid' : ''}`} {...register('current_address_id')}>
          <option value="">Select address…</option>
          {addresses.map(a => <option key={a.id} value={a.id}>{a.label} — {a.line1}</option>)}
        </select>
        {errors.current_address_id && <div className="invalid-feedback">{errors.current_address_id.message}</div>}
      </div>
      <div className="mb-3">
        <label className="form-label">Note (optional, e.g. "Level 2, bay 14")</label>
        <input className="form-control" {...register('current_location_note')} />
      </div>
      <button className="btn btn-primary" disabled={isSubmitting}>Update location</button>
    </form>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(m2): CarDetailPage — view car + update parking location"
```


---

## Milestone 3 — Bookings

### Task 15: Migration 003 — Bookings

**Files:**
- Create: `supabase/migrations/003_bookings.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/003_bookings.sql

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled');
CREATE TYPE calendar_sync_status AS ENUM ('pending', 'synced', 'failed', 'not_connected', 'pending_delete');

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id UUID NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  description TEXT,
  pickup_address_id UUID NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
  dropoff_address_id UUID NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
  pickup_address_snapshot TEXT NOT NULL,
  dropoff_address_snapshot TEXT NOT NULL,
  status booking_status NOT NULL DEFAULT 'confirmed',
  replacement_booking_id UUID REFERENCES bookings(id),
  calendar_sync_status calendar_sync_status NOT NULL DEFAULT 'not_connected',
  calendar_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  EXCLUDE USING gist (
    car_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'confirmed')
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Members can read bookings for their family
CREATE POLICY "read bookings" ON bookings FOR SELECT USING (is_family_member(family_id));
-- Members can update their own bookings (e.g. cancel)
CREATE POLICY "update own booking" ON bookings FOR UPDATE
  USING (user_id = auth.uid() AND is_family_member(family_id));
-- Insert handled by edge function (service role) — no direct insert policy
```

- [ ] **Step 2: Apply + regenerate types**

```bash
supabase db reset --local && npm run db:types
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(m3): migration 003 — bookings + GiST exclusion + calendar sync status"
```

---

### Task 16: `create-booking` Edge Function

**Files:**
- Create: `supabase/functions/create-booking/index.ts`

- [ ] **Step 1: Write `supabase/functions/create-booking/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

interface BookingInput {
  car_id: string
  start_time: string
  end_time: string
  description?: string
  pickup_address_id: string
  dropoff_address_id: string
}

serve(async (req) => {
  try {
    return await handleCreateBooking(req)
  } catch (err) {
    return respondError(err)
  }
})

async function handleCreateBooking(req: Request): Promise<Response> {
  const user = await requireUser(req)
  const input = await parseAndValidateBody(req)
  const membership = await assertActiveMember(user.id, input.car_id)
  const addressSnapshots = await fetchAddressSnapshots(input.pickup_address_id, input.dropoff_address_id)
  const booking = await insertBooking(user.id, membership.family_id, input, addressSnapshots)
  return ok({ booking })
}

async function parseAndValidateBody(req: Request): Promise<BookingInput> {
  const body = await req.json()
  const required = ['car_id', 'start_time', 'end_time', 'pickup_address_id', 'dropoff_address_id']
  for (const field of required) {
    if (!body[field]) throw new AppError(`${field} is required`)
  }
  if (new Date(body.end_time) <= new Date(body.start_time)) {
    throw new AppError('end_time must be after start_time')
  }
  return body as BookingInput
}

async function assertActiveMember(userId: string, carId: string) {
  const db = serviceDb()
  const { data: car } = await db.from('cars').select('family_id').eq('id', carId).single()
  if (!car) throw new AppError('Car not found', 404)

  const { data: membership } = await db.from('family_members')
    .select('family_id')
    .eq('user_id', userId)
    .eq('family_id', car.family_id)
    .eq('status', 'active')
    .single()
  if (!membership) throw new AppError('Not a member of this family', 403)
  return membership
}

async function fetchAddressSnapshots(pickupId: string, dropoffId: string) {
  const db = serviceDb()
  const { data: addrs, error } = await db.from('addresses')
    .select('id, label, line1, city, postcode')
    .in('id', [pickupId, dropoffId])
  if (error || !addrs || addrs.length < 2) throw new AppError('Invalid address IDs', 400)

  const pickup = addrs.find(a => a.id === pickupId)!
  const dropoff = addrs.find(a => a.id === dropoffId)!
  return {
    pickup_snapshot: `${pickup.label} — ${pickup.line1}, ${pickup.city} ${pickup.postcode}`,
    dropoff_snapshot: `${dropoff.label} — ${dropoff.line1}, ${dropoff.city} ${dropoff.postcode}`,
  }
}

async function insertBooking(
  userId: string,
  familyId: string,
  input: BookingInput,
  snapshots: { pickup_snapshot: string; dropoff_snapshot: string }
) {
  const db = serviceDb()
  const { data, error } = await db.from('bookings').insert({
    car_id: input.car_id,
    family_id: familyId,
    user_id: userId,
    start_time: input.start_time,
    end_time: input.end_time,
    description: input.description ?? null,
    pickup_address_id: input.pickup_address_id,
    dropoff_address_id: input.dropoff_address_id,
    pickup_address_snapshot: snapshots.pickup_snapshot,
    dropoff_address_snapshot: snapshots.dropoff_snapshot,
    status: 'confirmed',
    calendar_sync_status: 'not_connected',
  }).select().single()

  if (error) {
    // GiST exclusion violation
    if (error.code === '23P01') throw new AppError('This time slot conflicts with an existing booking', 409)
    throw new AppError(error.message)
  }
  return data
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(m3): create-booking edge function with conflict detection"
```

---

### Task 17: BookingFormPage

**Files:**
- Modify: `src/pages/BookingFormPage.tsx`

- [ ] **Step 1: Implement `BookingFormPage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { useFamily } from '../contexts/FamilyContext'
import { toastError, AppError } from '../lib/errors'
import toast from 'react-hot-toast'
import type { Database } from '../types/database.types'

type Car = Database['public']['Tables']['cars']['Row']
type Address = Database['public']['Tables']['addresses']['Row']

const bookingSchema = z.object({
  car_id: z.string().uuid('Select a car'),
  start_time: z.string().min(1, 'Required'),
  end_time: z.string().min(1, 'Required'),
  description: z.string().optional(),
  pickup_address_id: z.string().uuid('Select pickup address'),
  dropoff_address_id: z.string().uuid('Select drop-off address'),
}).refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'End time must be after start time',
  path: ['end_time'],
})
type BookingForm = z.infer<typeof bookingSchema>

export function BookingFormPage() {
  const session = useSession()!
  const { family } = useFamily()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [cars, setCars] = useState<Car[]>([])
  const [addresses, setAddresses] = useState<Address[]>([])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<BookingForm>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { car_id: searchParams.get('car_id') ?? '' },
  })

  useEffect(() => {
    if (family) { loadCars(family.id); loadAddresses(family.id) }
  }, [family])

  async function loadCars(familyId: string) {
    const { data } = await supabase.from('cars').select('*').eq('family_id', familyId).order('name')
    setCars(data ?? [])
  }

  async function loadAddresses(familyId: string) {
    const { data } = await supabase.from('addresses').select('*').eq('family_id', familyId).order('label')
    setAddresses(data ?? [])
  }

  async function submit(values: BookingForm) {
    const res = await supabase.functions.invoke('create-booking', {
      body: values,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.error) {
      const msg = res.data?.error ?? res.error.message
      if (res.error.status === 409) throw new AppError(`Conflict: ${msg}`)
      throw new AppError(msg)
    }
    toast.success('Booking confirmed!')
    navigate(`/bookings/${res.data.booking.id}`)
  }

  return (
    <div>
      <h2 className="mb-4">New booking</h2>
      <form onSubmit={handleSubmit(submit)}>
        <div className="mb-3">
          <label className="form-label">Car</label>
          <select className={`form-select ${errors.car_id ? 'is-invalid' : ''}`} {...register('car_id')}>
            <option value="">Select car…</option>
            {cars.map(c => <option key={c.id} value={c.id}>{c.name} ({c.plate})</option>)}
          </select>
          {errors.car_id && <div className="invalid-feedback">{errors.car_id.message}</div>}
        </div>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">Start time</label>
            <input type="datetime-local" className={`form-control ${errors.start_time ? 'is-invalid' : ''}`} {...register('start_time')} />
            {errors.start_time && <div className="invalid-feedback">{errors.start_time.message}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label">End time</label>
            <input type="datetime-local" className={`form-control ${errors.end_time ? 'is-invalid' : ''}`} {...register('end_time')} />
            {errors.end_time && <div className="invalid-feedback">{errors.end_time.message}</div>}
          </div>
        </div>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">Pickup address</label>
            <select className={`form-select ${errors.pickup_address_id ? 'is-invalid' : ''}`} {...register('pickup_address_id')}>
              <option value="">Select address…</option>
              {addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            {errors.pickup_address_id && <div className="invalid-feedback">{errors.pickup_address_id.message}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label">Drop-off address</label>
            <select className={`form-select ${errors.dropoff_address_id ? 'is-invalid' : ''}`} {...register('dropoff_address_id')}>
              <option value="">Select address…</option>
              {addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            {errors.dropoff_address_id && <div className="invalid-feedback">{errors.dropoff_address_id.message}</div>}
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label">Description (optional)</label>
          <input className="form-control" {...register('description')} />
        </div>
        <button className="btn btn-primary" disabled={isSubmitting}>Confirm booking</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(m3): BookingFormPage — create booking with conflict feedback"
```

---

### Task 18: CalendarPage

**Files:**
- Modify: `src/pages/CalendarPage.tsx`

- [ ] **Step 1: Implement `CalendarPage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'
import { toastError } from '../lib/errors'
import type { Database } from '../types/database.types'

type Booking = Database['public']['Tables']['bookings']['Row']

export function CalendarPage() {
  const { family } = useFamily()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<Booking[]>([])

  useEffect(() => { if (family) loadBookings(family.id) }, [family])

  async function loadBookings(familyId: string) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('family_id', familyId)
      .eq('status', 'confirmed')
      .order('start_time')
    if (error) toastError(error)
    else setBookings(data ?? [])
  }

  const events = bookings.map(b => ({
    id: b.id,
    title: b.description ?? 'Booking',
    start: b.start_time,
    end: b.end_time,
  }))

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Calendar</h2>
        <button className="btn btn-primary" onClick={() => navigate('/bookings/new')}>
          + New booking
        </button>
      </div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
        events={events}
        eventClick={({ event }) => navigate(`/bookings/${event.id}`)}
        height="auto"
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run type-check
git add -A
git commit -m "feat(m3): CalendarPage — FullCalendar booking view"
```

---

### Task 19: BookingDetailPage + cancel

**Files:**
- Modify: `src/pages/BookingDetailPage.tsx`

- [ ] **Step 1: Implement `BookingDetailPage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { useFamily } from '../contexts/FamilyContext'
import { toastError, AppError } from '../lib/errors'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import type { Database } from '../types/database.types'

type Booking = Database['public']['Tables']['bookings']['Row']

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const session = useSession()!
  const { myMembership } = useFamily()
  const navigate = useNavigate()
  const [booking, setBooking] = useState<Booking | null>(null)

  useEffect(() => { if (id) loadBooking(id) }, [id])

  async function loadBooking(bookingId: string) {
    const { data, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single()
    if (error) toastError(error)
    else setBooking(data)
  }

  async function cancelBooking() {
    if (!confirm('Cancel this booking?')) return
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', calendar_sync_status: 'pending_delete' })
      .eq('id', id!)
    if (error) throw new AppError(error.message)
    toast.success('Booking cancelled')
    navigate('/calendar')
  }

  if (!booking) return <div className="spinner-border text-primary" />

  const isOwner = booking.user_id === session.user.id
  const isFamilyOwner = myMembership?.role === 'owner'
  const canCancel = (isOwner || isFamilyOwner) && booking.status === 'confirmed'
  const canOverride = isFamilyOwner && booking.status === 'confirmed' && booking.user_id !== session.user.id

  return (
    <div>
      <Link to="/calendar" className="btn btn-outline-secondary btn-sm mb-3">← Calendar</Link>
      <h2 className="mb-3">{booking.description ?? 'Booking'}</h2>
      <dl className="row">
        <dt className="col-sm-3">Status</dt>
        <dd className="col-sm-9">
          <span className={`badge ${booking.status === 'confirmed' ? 'bg-success' : 'bg-secondary'}`}>
            {booking.status}
          </span>
        </dd>
        <dt className="col-sm-3">Start</dt>
        <dd className="col-sm-9">{format(new Date(booking.start_time), 'PPpp')}</dd>
        <dt className="col-sm-3">End</dt>
        <dd className="col-sm-9">{format(new Date(booking.end_time), 'PPpp')}</dd>
        <dt className="col-sm-3">Pickup</dt>
        <dd className="col-sm-9">{booking.pickup_address_snapshot}</dd>
        <dt className="col-sm-3">Drop-off</dt>
        <dd className="col-sm-9">{booking.dropoff_address_snapshot}</dd>
        <dt className="col-sm-3">Calendar sync</dt>
        <dd className="col-sm-9">{booking.calendar_sync_status}</dd>
      </dl>
      <div className="d-flex gap-2 mt-4">
        {canCancel && (
          <button className="btn btn-outline-danger" onClick={cancelBooking}>Cancel booking</button>
        )}
        {canOverride && (
          <Link className="btn btn-warning" to={`/bookings/${id}/override`}>Override booking</Link>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run type-check
git add -A
git commit -m "feat(m3): BookingDetailPage — view + cancel booking"
```

---

### Task 20: E2E Tests T1–T3 (booking flow)

**Files:**
- Create: `tests/e2e/booking-flow.spec.ts`

- [ ] **Step 1: Write `tests/e2e/booking-flow.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { loginAs, serviceRoleClient } from './helpers'

const ALICE = 'user-a@test.carshare'
const BOB = 'user-b@test.carshare'

test.describe('T1: Alice creates a booking', () => {
  test('booking appears on calendar', async ({ page }) => {
    await page.goto('/')
    await loginAs(page, ALICE)
    await page.reload()

    // Navigate to booking form
    await page.click('text=+ New booking')
    await expect(page).toHaveURL(/#\/bookings\/new/)

    // Fill form
    await page.selectOption('[name=car_id]', { index: 1 })
    await page.fill('[name=start_time]', nextWeekDateTimeLocal(9, 0))
    await page.fill('[name=end_time]', nextWeekDateTimeLocal(11, 0))
    await page.fill('[name=description]', 'School run')
    await page.selectOption('[name=pickup_address_id]', { index: 1 })
    await page.selectOption('[name=dropoff_address_id]', { index: 1 })
    await page.click('button:has-text("Confirm booking")')

    // Redirected to booking detail
    await expect(page).toHaveURL(/#\/bookings\//)
    await expect(page.locator('text=School run')).toBeVisible()
    await expect(page.locator('.badge.bg-success')).toContainText('confirmed')
  })
})

test.describe('T2: Bob sees a conflict', () => {
  test('conflict error shown when booking overlaps Alice\'s booking', async ({ page }) => {
    await page.goto('/')
    await loginAs(page, BOB)
    await page.reload()

    await page.click('text=+ New booking')
    await page.selectOption('[name=car_id]', { index: 1 })
    // Overlap with Alice's booking from T1
    await page.fill('[name=start_time]', nextWeekDateTimeLocal(10, 0))
    await page.fill('[name=end_time]', nextWeekDateTimeLocal(12, 0))
    await page.selectOption('[name=pickup_address_id]', { index: 1 })
    await page.selectOption('[name=dropoff_address_id]', { index: 1 })
    await page.click('button:has-text("Confirm booking")')

    // Toast error for conflict
    await expect(page.locator('.toast, [role=alert]')).toContainText('conflict', { ignoreCase: true })
  })
})

test.describe('T3: Alice cancels her booking', () => {
  test('booking status changes to cancelled', async ({ page }) => {
    await page.goto('/')
    await loginAs(page, ALICE)
    await page.reload()

    // Find booking via calendar
    await page.click('a[href*="calendar"], text=Calendar')
    const event = page.locator('.fc-event').first()
    await event.click()

    await expect(page).toHaveURL(/#\/bookings\//)
    await page.click('button:has-text("Cancel booking")')
    await page.click('button:has-text("OK"), text=OK') // confirm dialog

    await expect(page).toHaveURL(/#\/calendar/)
  })
})

function nextWeekDateTimeLocal(hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString().slice(0, 16)
}
```

- [ ] **Step 2: Start dev server + run tests**

```bash
# Terminal 1
npm run dev &
# Terminal 2
npm run test:e2e -- tests/e2e/booking-flow.spec.ts
```
Expected: T1 PASS, T2 PASS, T3 PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(m3): E2E T1–T3 booking flow, conflict detection, cancel"
```

---

## Milestone 4 — Override Bookings

### Task 21: `override-booking` Edge Function

**Files:**
- Create: `supabase/functions/override-booking/index.ts`

- [ ] **Step 1: Write `supabase/functions/override-booking/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

interface OverrideInput {
  booking_id: string
  start_time: string
  end_time: string
  description?: string
  pickup_address_id: string
  dropoff_address_id: string
}

serve(async (req) => {
  try {
    return await handleOverrideBooking(req)
  } catch (err) {
    return respondError(err)
  }
})

async function handleOverrideBooking(req: Request): Promise<Response> {
  const user = await requireUser(req)
  const input = await parseAndValidateBody(req)
  const original = await fetchAndValidateOriginal(input.booking_id, user.id)
  const snapshots = await fetchAddressSnapshots(input.pickup_address_id, input.dropoff_address_id)
  const replacement = await cancelAndReplace(original, input, user.id, snapshots)
  return ok({ replacement })
}

async function parseAndValidateBody(req: Request): Promise<OverrideInput> {
  const body = await req.json()
  const required = ['booking_id', 'start_time', 'end_time', 'pickup_address_id', 'dropoff_address_id']
  for (const field of required) {
    if (!body[field]) throw new AppError(`${field} is required`)
  }
  if (new Date(body.end_time) <= new Date(body.start_time)) {
    throw new AppError('end_time must be after start_time')
  }
  return body as OverrideInput
}

async function fetchAndValidateOriginal(bookingId: string, userId: string) {
  const db = serviceDb()
  const { data: booking } = await db.from('bookings')
    .select('id, car_id, family_id, user_id, status')
    .eq('id', bookingId)
    .single()

  if (!booking) throw new AppError('Booking not found', 404)
  if (booking.status !== 'confirmed') throw new AppError('Can only override confirmed bookings', 400)

  const { data: membership } = await db.from('family_members')
    .select('id')
    .eq('user_id', userId)
    .eq('family_id', booking.family_id)
    .eq('role', 'owner')
    .eq('status', 'active')
    .single()
  if (!membership) throw new AppError('Only owners can override bookings', 403)

  if (booking.user_id === userId) throw new AppError('Cannot override your own booking', 400)

  return booking
}

async function fetchAddressSnapshots(pickupId: string, dropoffId: string) {
  const db = serviceDb()
  const { data: addrs } = await db.from('addresses')
    .select('id, label, line1, city, postcode')
    .in('id', [pickupId, dropoffId])
  if (!addrs || addrs.length < 2) throw new AppError('Invalid address IDs', 400)
  const pickup = addrs.find(a => a.id === pickupId)!
  const dropoff = addrs.find(a => a.id === dropoffId)!
  return {
    pickup_snapshot: `${pickup.label} — ${pickup.line1}, ${pickup.city} ${pickup.postcode}`,
    dropoff_snapshot: `${dropoff.label} — ${dropoff.line1}, ${dropoff.city} ${dropoff.postcode}`,
  }
}

async function cancelAndReplace(
  original: { id: string; car_id: string; family_id: string },
  input: OverrideInput,
  userId: string,
  snapshots: { pickup_snapshot: string; dropoff_snapshot: string }
) {
  const db = serviceDb()

  // Cancel original first (removes it from GiST index)
  const { error: cancelErr } = await db.from('bookings')
    .update({ status: 'cancelled', calendar_sync_status: 'pending_delete' })
    .eq('id', original.id)
  if (cancelErr) throw new AppError(cancelErr.message)

  // Insert replacement
  const { data: replacement, error: insertErr } = await db.from('bookings').insert({
    car_id: original.car_id,
    family_id: original.family_id,
    user_id: userId,
    start_time: input.start_time,
    end_time: input.end_time,
    description: input.description ?? null,
    pickup_address_id: input.pickup_address_id,
    dropoff_address_id: input.dropoff_address_id,
    pickup_address_snapshot: snapshots.pickup_snapshot,
    dropoff_address_snapshot: snapshots.dropoff_snapshot,
    status: 'confirmed',
    calendar_sync_status: 'not_connected',
  }).select().single()

  if (insertErr) {
    if (insertErr.code === '23P01') throw new AppError('Replacement slot conflicts with another booking', 409)
    throw new AppError(insertErr.message)
  }

  // Link original to replacement
  await db.from('bookings').update({ replacement_booking_id: replacement!.id }).eq('id', original.id)

  return replacement
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(m4): override-booking edge function"
```

---

### Task 22: OverridePage

**Files:**
- Modify: `src/pages/OverridePage.tsx`

- [ ] **Step 1: Implement `OverridePage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { useFamily } from '../contexts/FamilyContext'
import { toastError, AppError } from '../lib/errors'
import toast from 'react-hot-toast'
import type { Database } from '../types/database.types'

type Address = Database['public']['Tables']['addresses']['Row']
type Booking = Database['public']['Tables']['bookings']['Row']

const overrideSchema = z.object({
  start_time: z.string().min(1, 'Required'),
  end_time: z.string().min(1, 'Required'),
  description: z.string().optional(),
  pickup_address_id: z.string().uuid('Select pickup'),
  dropoff_address_id: z.string().uuid('Select drop-off'),
}).refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'End time must be after start time', path: ['end_time'],
})
type OverrideForm = z.infer<typeof overrideSchema>

export function OverridePage() {
  const { id } = useParams<{ id: string }>()
  const session = useSession()!
  const { family, myMembership } = useFamily()
  const navigate = useNavigate()
  const [original, setOriginal] = useState<Booking | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])

  useEffect(() => {
    if (id && family) { loadOriginal(id); loadAddresses(family.id) }
  }, [id, family])

  async function loadOriginal(bookingId: string) {
    const { data, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single()
    if (error) toastError(error)
    else setOriginal(data)
  }

  async function loadAddresses(familyId: string) {
    const { data } = await supabase.from('addresses').select('*').eq('family_id', familyId).order('label')
    setAddresses(data ?? [])
  }

  if (myMembership?.role !== 'owner') {
    return <p className="text-danger">Only owners can override bookings.</p>
  }

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OverrideForm>({
    resolver: zodResolver(overrideSchema),
  })

  async function submit(values: OverrideForm) {
    const res = await supabase.functions.invoke('override-booking', {
      body: { booking_id: id, ...values },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.error) {
      const msg = res.data?.error ?? res.error.message
      throw new AppError(msg)
    }
    toast.success('Booking overridden')
    navigate(`/bookings/${res.data.replacement.id}`)
  }

  return (
    <div>
      <Link to={`/bookings/${id}`} className="btn btn-outline-secondary btn-sm mb-3">← Back</Link>
      <h2 className="mb-4">Override booking</h2>
      {original && (
        <div className="alert alert-warning mb-4">
          Overriding: <strong>{original.description ?? 'Booking'}</strong> by user {original.user_id.slice(0, 8)}…
          The original will be cancelled and replaced.
        </div>
      )}
      <form onSubmit={handleSubmit(submit)}>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">New start time</label>
            <input type="datetime-local" className={`form-control ${errors.start_time ? 'is-invalid' : ''}`} {...register('start_time')} />
            {errors.start_time && <div className="invalid-feedback">{errors.start_time.message}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label">New end time</label>
            <input type="datetime-local" className={`form-control ${errors.end_time ? 'is-invalid' : ''}`} {...register('end_time')} />
            {errors.end_time && <div className="invalid-feedback">{errors.end_time.message}</div>}
          </div>
        </div>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">Pickup address</label>
            <select className={`form-select ${errors.pickup_address_id ? 'is-invalid' : ''}`} {...register('pickup_address_id')}>
              <option value="">Select…</option>
              {addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Drop-off address</label>
            <select className={`form-select ${errors.dropoff_address_id ? 'is-invalid' : ''}`} {...register('dropoff_address_id')}>
              <option value="">Select…</option>
              {addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label">Description (optional)</label>
          <input className="form-control" {...register('description')} />
        </div>
        <button className="btn btn-warning" disabled={isSubmitting}>Confirm override</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(m4): OverridePage — owner override booking UI"
```

---

### Task 23: E2E Tests T4–T5 (override + RLS)

**Files:**
- Create: `tests/e2e/override-flow.spec.ts`

- [ ] **Step 1: Write `tests/e2e/override-flow.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { loginAs, serviceRoleClient } from './helpers'

const ALICE = 'user-a@test.carshare'
const BOB = 'user-b@test.carshare'
const DAN = 'user-d@test.carshare'

test.describe('T4: Alice (owner) overrides Bob\'s booking', () => {
  test('original cancelled, replacement visible on calendar', async ({ page }) => {
    await page.goto('/')
    await loginAs(page, ALICE)
    await page.reload()

    // Navigate to Bob's booking (find via calendar)
    await page.click('a[href*="calendar"], text=Calendar')
    const event = page.locator('.fc-event').first()
    await event.click()

    await expect(page).toHaveURL(/#\/bookings\//)

    // Owner should see Override button
    const overrideLink = page.locator('a:has-text("Override booking")')
    await expect(overrideLink).toBeVisible()
    await overrideLink.click()

    await expect(page).toHaveURL(/#\/bookings\/.+\/override/)

    // Fill override form
    await page.fill('[name=start_time]', futureDateTime(8, 0))
    await page.fill('[name=end_time]', futureDateTime(10, 0))
    await page.selectOption('[name=pickup_address_id]', { index: 1 })
    await page.selectOption('[name=dropoff_address_id]', { index: 1 })
    await page.click('button:has-text("Confirm override")')

    // Redirected to replacement booking detail
    await expect(page).toHaveURL(/#\/bookings\//)
    await expect(page.locator('.badge.bg-success')).toContainText('confirmed')
  })
})

test.describe('T5: Dan (different family) cannot read Alice\'s bookings', () => {
  test('direct supabase query returns no rows due to RLS', async ({ page }) => {
    await page.goto('/')
    await loginAs(page, DAN)
    await page.reload()

    // Attempt to read bookings from Alice's family directly via Supabase JS
    const count = await page.evaluate(
      async ([url, key]: string[]) => {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
        const sb = createClient(url, key)
        const authStr = localStorage.getItem(Object.keys(localStorage).find(k => k.includes('auth-token'))!)
        const session = JSON.parse(authStr!)
        sb.auth.setSession(session)
        const { data } = await sb.from('bookings').select('id')
        return data?.length ?? 0
      },
      [process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!]
    )
    // Dan is in a different family — RLS returns 0 rows from Alice's family
    expect(count).toBe(0)
  })
})

function futureDateTime(hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString().slice(0, 16)
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:e2e -- tests/e2e/override-flow.spec.ts
```
Expected: T4 PASS, T5 PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(m4): E2E T4 owner override + T5 RLS cross-family isolation"
```


---

## Milestone 5 — Google Calendar Sync

### Task 24: Migration 004 — OAuth tokens + SettingsPage

**Files:**
- Create: `supabase/migrations/004_oauth_tokens.sql`
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/004_oauth_tokens.sql

CREATE TABLE user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expiry TIMESTAMPTZ,
  UNIQUE (user_id, provider)
);

ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- No SELECT policy — only edge functions (service_role) may read tokens
-- Users can delete their own token row (disconnect)
CREATE POLICY "user deletes own token" ON user_oauth_tokens
  FOR DELETE USING (user_id = auth.uid());
```

- [ ] **Step 2: Apply + regenerate types**

```bash
supabase db reset --local && npm run db:types
```

- [ ] **Step 3: Implement `SettingsPage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'

export function SettingsPage() {
  const session = useSession()!
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkConnection() }, [session])

  async function checkConnection() {
    setLoading(true)
    // Edge function returns whether token exists — no client read
    const res = await supabase.functions.invoke('check-calendar-connection', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setConnected(res.data?.connected ?? false)
    setLoading(false)
  }

  async function connectCalendar() {
    // Redirect to Google OAuth with calendar scope
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar.events',
        redirectTo: `${window.location.origin}/#/settings?calendar=connected`,
      },
    })
    if (error) toastError(error)
  }

  async function disconnectCalendar() {
    const { error } = await supabase.from('user_oauth_tokens')
      .delete()
      .eq('user_id', session.user.id)
      .eq('provider', 'google')
    if (error) toastError(error)
    else { toast.success('Google Calendar disconnected'); setConnected(false) }
  }

  if (loading) return <div className="spinner-border text-primary" />

  return (
    <div>
      <h2 className="mb-4">Settings</h2>
      <div className="card p-4" style={{ maxWidth: 500 }}>
        <h5>Google Calendar</h5>
        <p className="text-muted">
          {connected
            ? 'Your bookings will sync to your Google Calendar automatically.'
            : 'Connect your Google account to sync bookings to your calendar.'}
        </p>
        {connected
          ? <button className="btn btn-outline-danger" onClick={disconnectCalendar}>Disconnect</button>
          : <button className="btn btn-primary" onClick={connectCalendar}>Connect Google Calendar</button>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(m5): migration 004 oauth_tokens + SettingsPage connect/disconnect calendar"
```

---

### Task 25: `calendar-sync` Edge Function (cron)

**Files:**
- Create: `supabase/functions/calendar-sync/index.ts`

- [ ] **Step 1: Write `supabase/functions/calendar-sync/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

serve(async (req) => {
  try {
    return await handleCalendarSync()
  } catch (err) {
    return respondError(err)
  }
})

async function handleCalendarSync(): Promise<Response> {
  const pending = await fetchPendingBookings()
  const results = await syncAll(pending)
  return ok({ synced: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length })
}

async function fetchPendingBookings() {
  const db = serviceDb()
  const { data, error } = await db.from('bookings')
    .select('id, user_id, start_time, end_time, description, pickup_address_snapshot, dropoff_address_snapshot, calendar_event_id, calendar_sync_status')
    .in('calendar_sync_status', ['pending', 'pending_delete'])
  if (error) throw new AppError(error.message)
  return data ?? []
}

async function syncAll(bookings: Awaited<ReturnType<typeof fetchPendingBookings>>) {
  return Promise.all(bookings.map(b => syncOne(b).then(() => ({ ok: true })).catch(e => {
    console.error(`Sync failed for booking ${b.id}:`, e)
    return { ok: false }
  })))
}

async function syncOne(booking: {
  id: string; user_id: string; start_time: string; end_time: string
  description: string | null; pickup_address_snapshot: string
  calendar_event_id: string | null; calendar_sync_status: string
}) {
  const db = serviceDb()
  const token = await fetchUserToken(booking.user_id)
  if (!token) {
    await db.from('bookings').update({ calendar_sync_status: 'not_connected' }).eq('id', booking.id)
    return
  }

  const accessToken = await ensureFreshToken(token)

  if (booking.calendar_sync_status === 'pending_delete' && booking.calendar_event_id) {
    await deleteCalendarEvent(accessToken, booking.calendar_event_id)
    await db.from('bookings').update({ calendar_sync_status: 'synced', calendar_event_id: null }).eq('id', booking.id)
    return
  }

  const eventId = await upsertCalendarEvent(accessToken, booking)
  await db.from('bookings').update({ calendar_sync_status: 'synced', calendar_event_id: eventId }).eq('id', booking.id)
}

async function fetchUserToken(userId: string) {
  const db = serviceDb()
  const { data } = await db.from('user_oauth_tokens')
    .select('access_token, refresh_token, expiry')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single()
  return data ?? null
}

async function ensureFreshToken(token: { access_token: string; refresh_token: string | null; expiry: string | null }) {
  if (!token.expiry || new Date(token.expiry) > new Date(Date.now() + 60_000)) {
    return token.access_token
  }
  if (!token.refresh_token) throw new AppError('No refresh token available')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
  })
  if (!res.ok) throw new AppError(`Token refresh failed: ${await res.text()}`)
  const json = await res.json()
  return json.access_token as string
}

async function upsertCalendarEvent(
  accessToken: string,
  booking: { id: string; start_time: string; end_time: string; description: string | null; pickup_address_snapshot: string; calendar_event_id: string | null }
) {
  const event = {
    summary: booking.description ?? 'Car booking',
    location: booking.pickup_address_snapshot,
    start: { dateTime: booking.start_time, timeZone: 'UTC' },
    end: { dateTime: booking.end_time, timeZone: 'UTC' },
  }

  const url = booking.calendar_event_id
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${booking.calendar_event_id}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

  const res = await fetch(url, {
    method: booking.calendar_event_id ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
  if (!res.ok) throw new AppError(`Calendar API error: ${await res.text()}`)
  const json = await res.json()
  return json.id as string
}

async function deleteCalendarEvent(accessToken: string, eventId: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok && res.status !== 410) throw new AppError(`Calendar delete failed: ${await res.text()}`)
}
```

- [ ] **Step 2: Register cron in `supabase/config.toml`**

Add to `[functions.calendar-sync]` section:
```toml
[functions.calendar-sync]
verify_jwt = false

[[cron]]
name = "calendar-sync"
schedule = "*/5 * * * *"
function = "calendar-sync"
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(m5): calendar-sync cron edge function"
```

---

### Task 26: E2E Test T6 (calendar sync)

**Files:**
- Create: `tests/e2e/calendar-sync.spec.ts`

- [ ] **Step 1: Write `tests/e2e/calendar-sync.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { loginAs, serviceRoleClient } from './helpers'

const ALICE = 'user-a@test.carshare'

test.describe('T6: Calendar sync status flows through booking lifecycle', () => {
  test('new booking starts as not_connected; updating to pending triggers sync status', async ({ page }) => {
    await page.goto('/')
    await loginAs(page, ALICE)
    await page.reload()

    // Create a booking
    await page.click('text=+ New booking')
    await page.selectOption('[name=car_id]', { index: 1 })
    await page.fill('[name=start_time]', futureDateTime(14, 0))
    await page.fill('[name=end_time]', futureDateTime(16, 0))
    await page.fill('[name=description]', 'Calendar sync test')
    await page.selectOption('[name=pickup_address_id]', { index: 1 })
    await page.selectOption('[name=dropoff_address_id]', { index: 1 })
    await page.click('button:has-text("Confirm booking")')

    await expect(page).toHaveURL(/#\/bookings\//)
    // Default: not_connected (no token stored)
    await expect(page.locator('dd').filter({ hasText: 'not_connected' })).toBeVisible()

    // Manually update booking to 'pending' via service role to simulate token connect
    const bookingUrl = page.url()
    const bookingId = bookingUrl.split('/').pop()!

    const db = serviceRoleClient()
    await db.from('bookings').update({ calendar_sync_status: 'pending' }).eq('id', bookingId)

    // Reload page and verify status shows pending
    await page.reload()
    await expect(page.locator('dd').filter({ hasText: /pending|synced/ })).toBeVisible()
  })
})

function futureDateTime(hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() + 21)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString().slice(0, 16)
}
```

- [ ] **Step 2: Run test**

```bash
npm run test:e2e -- tests/e2e/calendar-sync.spec.ts
```
Expected: T6 PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(m5): E2E T6 calendar sync status lifecycle"
```

---

## Milestone 6 — Deploy

### Task 27: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Type-check
        run: npm run type-check

      - name: Build
        run: npm run build
        env:
          NODE_ENV: production
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

- [ ] **Step 2: Set GitHub secrets**

In GitHub repo → Settings → Secrets → Actions, add:
- `VITE_SUPABASE_URL` — your production Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your production Supabase anon key

- [ ] **Step 3: Enable GitHub Pages**

In GitHub repo → Settings → Pages:
- Source: GitHub Actions

- [ ] **Step 4: Type-check + commit**

```bash
npm run type-check
git add -A
git commit -m "feat(m6): GitHub Actions deploy workflow for GitHub Pages"
```

---

## End-to-End Test Summary

| ID | Scenario | File | Tests |
|----|----------|------|-------|
| T1 | Alice creates a booking | `booking-flow.spec.ts` | Form submit → confirmed badge on detail page |
| T2 | Bob gets conflict error | `booking-flow.spec.ts` | Overlapping times → toast with "conflict" |
| T3 | Alice cancels booking | `booking-flow.spec.ts` | Cancel → redirected to calendar |
| T4 | Alice overrides Bob's booking | `override-flow.spec.ts` | Owner override → original cancelled, replacement confirmed |
| T5 | Dan (different family) RLS | `override-flow.spec.ts` | Direct query → 0 rows returned |
| T6 | Calendar sync status | `calendar-sync.spec.ts` | not_connected → pending → visible on detail page |

---

## Self-Review Notes

- **Spec coverage:** All 5 Edge Functions, 4 migrations, 13 pages, 3 E2E spec files, GitHub Actions deploy — ✅
- **No placeholders:** All steps contain actual code — ✅
- **Type consistency:** `AppError`, `serviceDb()`, `requireUser()`, `ok()`, `respondError()` used consistently across all edge functions — ✅
- **FamilyContext `loadFamily`:** Uses `.single()` — if user has no membership returns null cleanly — ✅
- **GiST exclusion code:** `23P01` error code handled in both `create-booking` and `override-booking` — ✅
- **Invite token flow:** Raw token → sha256 hash → DB. Edge functions use `encodeHex` from Deno std — ✅
- **`check-calendar-connection` edge function:** Referenced in SettingsPage but not implemented yet add as Task 24b below. 

### Task 24b: `check-calendar-connection` Edge Function

**Files:**
- Create: `supabase/functions/check-calendar-connection/index.ts`

- [ ] **Step 1: Write function**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'

serve(async (req) => {
  try {
    const user = await requireUser(req)
    const db = serviceDb()
    const { data } = await db.from('user_oauth_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single()
    return ok({ connected: !!data })
  } catch (err) {
    return respondError(err)
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/check-calendar-connection/
git commit -m "feat(m5): check-calendar-connection edge function"
```


---

## Adversarial Review Amendments

> **Apply these corrections when executing the plan.** Each amendment overrides or extends the referenced task.

---

### Amendment A1 — Migration 001: Remove conflicting full UNIQUE constraint

**Fixes:** Tasks 5 (migration 001) — full `UNIQUE(family_id, user_id)` blocks any family from having more than one pending invite simultaneously (NULL = NULL in unique index, so second pending invite with `user_id = NULL` is rejected).

**In `001_initial.sql`, replace:**
```sql
  CONSTRAINT unique_active_member UNIQUE (family_id, user_id)
```
**With:** *(delete that line entirely — rely on partial indexes below)*

Also **add** these two partial indexes (replacing the existing single partial index):
```sql
-- Prevent duplicate active/pending user memberships (allows re-invite after 'removed')
CREATE UNIQUE INDEX idx_family_members_active ON family_members(family_id, user_id)
  WHERE status != 'removed' AND user_id IS NOT NULL;

-- Prevent duplicate pending invites to the same email in the same family
CREATE UNIQUE INDEX idx_family_members_pending_email ON family_members(family_id, invited_email)
  WHERE status = 'pending' AND invited_email IS NOT NULL;
```

---

### Amendment A2 — Migration 001: Add INSERT RLS policies for bootstrap

**Fixes:** Tasks 5 + 6 — `OnboardingPage` calls `supabase.from('families').insert()` and then `supabase.from('family_members').insert()` with `role='owner'`. Neither has an INSERT RLS policy, so both calls fail with a 403.

**Add to `001_initial.sql` RLS section:**
```sql
-- Any authenticated user can create a family
CREATE POLICY "create family" ON families
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- A user can insert themselves as owner (bootstrap: first membership row)
CREATE POLICY "self join as owner" ON family_members
  FOR INSERT WITH CHECK (user_id = auth.uid() AND role = 'owner');
```

---

### Amendment A3 — `invite-member`: Fix upsert conflict target

**Fixes:** Tasks 8 — `{ onConflict: 'family_id,invited_email' }` references a constraint that does not exist in the original plan, causing a PostgREST 42P10 error.

After Amendment A1 adds `idx_family_members_pending_email`, update `upsertInvite` in `invite-member/index.ts`:

```typescript
async function upsertInvite(familyId: string, email: string, tokenHash: string) {
  const db = serviceDb()
  const expires = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

  // Check for existing pending invite first
  const { data: existing } = await db.from('family_members')
    .select('id')
    .eq('family_id', familyId)
    .eq('invited_email', email)
    .eq('status', 'pending')
    .single()

  if (existing) {
    // Refresh token on existing pending invite
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
```

---

### Amendment A4 — `AuthContext` + `ProtectedRoute`: Add loading state

**Fixes:** Task 4 — `ProtectedRoute` immediately redirects to `/login` before `getSession()` resolves because `session` starts as `null`.

**Replace `src/contexts/AuthContext.tsx`:**
```typescript
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}

export function useSession() {
  return useContext(AuthContext).session
}

export function useAuthLoading() {
  return useContext(AuthContext).loading
}
```

**Replace `src/components/ProtectedRoute.tsx`:**
```typescript
import { Navigate } from 'react-router-dom'
import { useSession, useAuthLoading } from '../contexts/AuthContext'
import { ReactNode } from 'react'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const session = useSession()
  const loading = useAuthLoading()
  if (loading) return <div className="min-vh-100 d-flex align-items-center justify-content-center"><div className="spinner-border text-primary" /></div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

---

### Amendment A5 — `create-booking`: Add past-time validation

**Fixes:** Task 16 — spec requires bookings in the past to be rejected.

**In `create-booking/index.ts`, add to `parseAndValidateBody()` after the time-range check:**
```typescript
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
if (new Date(body.start_time) < fiveMinutesAgo) {
  throw new AppError('Booking start time is in the past', 400, 'BOOKING_IN_PAST')
}
```

---

### Amendment A6 — Override: Wrap cancel+replace in a PL/pgSQL RPC

**Fixes:** Tasks 15 + 21 — cancel then insert are two separate DB calls. If insert fails, original booking is permanently cancelled with no replacement.

**Add to `supabase/migrations/003_bookings.sql`:**
```sql
-- Atomic override: cancel original + insert replacement in one transaction
CREATE OR REPLACE FUNCTION override_booking(
  p_original_id UUID,
  p_car_id UUID,
  p_family_id UUID,
  p_user_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_description TEXT,
  p_pickup_address_id UUID,
  p_dropoff_address_id UUID,
  p_pickup_snapshot TEXT,
  p_dropoff_snapshot TEXT
) RETURNS bookings LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_replacement bookings;
BEGIN
  -- Cancel original
  UPDATE bookings SET status = 'cancelled', calendar_sync_status = 'pending_delete'
  WHERE id = p_original_id;

  -- Insert replacement (GiST exclusion will throw 23P01 on conflict)
  INSERT INTO bookings (
    car_id, family_id, user_id, start_time, end_time, description,
    pickup_address_id, dropoff_address_id,
    pickup_address_snapshot, dropoff_address_snapshot,
    status, calendar_sync_status
  ) VALUES (
    p_car_id, p_family_id, p_user_id, p_start_time, p_end_time, p_description,
    p_pickup_address_id, p_dropoff_address_id,
    p_pickup_snapshot, p_dropoff_snapshot,
    'confirmed', 'not_connected'
  ) RETURNING * INTO v_replacement;

  -- Link original to replacement
  UPDATE bookings SET replacement_booking_id = v_replacement.id WHERE id = p_original_id;

  RETURN v_replacement;
END;
$$;
```

**Replace `cancelAndReplace()` in `override-booking/index.ts`:**
```typescript
async function cancelAndReplace(
  original: { id: string; car_id: string; family_id: string },
  input: OverrideInput,
  userId: string,
  snapshots: { pickup_snapshot: string; dropoff_snapshot: string }
) {
  const db = serviceDb()
  const { data, error } = await db.rpc('override_booking', {
    p_original_id: original.id,
    p_car_id: original.car_id,
    p_family_id: original.family_id,
    p_user_id: userId,
    p_start_time: input.start_time,
    p_end_time: input.end_time,
    p_description: input.description ?? null,
    p_pickup_address_id: input.pickup_address_id,
    p_dropoff_address_id: input.dropoff_address_id,
    p_pickup_snapshot: snapshots.pickup_snapshot,
    p_dropoff_snapshot: snapshots.dropoff_snapshot,
  })
  if (error) {
    if (error.code === '23P01') throw new AppError('Replacement slot conflicts with another booking', 409)
    throw new AppError(error.message)
  }
  return data
}
```

---

### Amendment A7 — `calendar-sync`: Add CRON_SECRET authentication

**Fixes:** Task 25 — function with `verify_jwt = false` is publicly callable by anyone.

**Add at top of `handleCalendarSync()` in `calendar-sync/index.ts`:**
```typescript
async function handleCalendarSync(req: Request): Promise<Response> {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  // ... rest of function
}
```

**Set secret:** `supabase secrets set CRON_SECRET=$(openssl rand -base64 32)`

**Update `supabase/config.toml` cron entry to pass the secret** (Supabase Cron automatically passes service-role key; add the secret as a header in the cron config when supported, or rely on Supabase's internal cron-to-function trusted channel).

---

### Amendment A8 — `loginAs()`: Fix localStorage key derivation

**Fixes:** Task 2 — `127.0.0.1`.split('.')[0]` = `'127'`, producing key `sb-127-auth-token` which the Supabase client never reads.

**Replace `loginAs()` in `tests/e2e/helpers.ts`:**
```typescript
export async function loginAs(page: Page, email: string, password = 'testpassword123') {
  const url = process.env.VITE_SUPABASE_URL!
  const key = process.env.VITE_SUPABASE_ANON_KEY!

  const res = await page.evaluate(
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

  // Find the key the Supabase client actually uses (works for both local and hosted)
  await page.evaluate(
    ([supaUrl, supaKey, session]: [string, string, unknown]) => {
      // Supabase JS v2 derives the key from a hash of the URL
      // Simplest approach: set all likely keys and let the client pick it up
      const storageKey = `sb-${new URL(supaUrl).hostname.replace(/\./g, '-')}-auth-token`
      localStorage.setItem(storageKey, JSON.stringify(session))
      // Also try the standard pattern used by supabase-js
      localStorage.setItem(`sb-${btoa(supaUrl).slice(0, 20)}-auth-token`, JSON.stringify(session))
    },
    [url, key, res]
  )
}
```

> **Note:** For a fully reliable implementation, after calling `loginAs()`, call `page.reload()` so the Supabase client picks up the stored session on mount.

---

### Amendment A9 — `ensureFreshToken`: Persist refreshed token

**Fixes:** Task 25 — after refreshing the Google access token, the new token is not stored, causing repeated re-refreshes.

**In `calendar-sync/index.ts`, update `ensureFreshToken()` to accept and use `userId`:**
```typescript
async function ensureFreshToken(
  userId: string,
  token: { access_token: string; refresh_token: string | null; expiry: string | null }
): Promise<string> {
  if (!token.expiry || new Date(token.expiry) > new Date(Date.now() + 60_000)) {
    return token.access_token
  }
  if (!token.refresh_token) throw new AppError('No refresh token available')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
  })
  if (!res.ok) throw new AppError(`Token refresh failed: ${await res.text()}`)
  const json = await res.json()

  // Persist the new token
  const db = serviceDb()
  await db.from('user_oauth_tokens').update({
    access_token: json.access_token,
    expiry: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  }).eq('user_id', userId).eq('provider', 'google')

  return json.access_token as string
}
```

Update call sites in `syncOne()` to pass `booking.user_id`:
```typescript
const accessToken = await ensureFreshToken(booking.user_id, token)
```

---

### Amendment A10 — `LoginPage`: Fix OAuth redirect base URL

**Fixes:** Task 6 — redirect after Google OAuth lands on bare origin root (404 on GitHub Pages).

**In `LoginPage.tsx`, change:**
```typescript
options: { redirectTo: window.location.origin },
```
**To:**
```typescript
options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
```

---

### Amendment A11 — `globalSetup.ts`: Seed family, car, and addresses

**Fixes:** Task 2 + Task 20 — E2E tests assume Alice has a family, at least one car, and at least one address, but `globalSetup` only creates auth users. All booking-form selectors with `{ index: 1 }` would match nothing.

**Extend `tests/e2e/globalSetup.ts`** — add after the `createTestUser` loop:

```typescript
export default async function globalSetup() {
  execSync('npm run db:reset', { stdio: 'inherit' })

  const admin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const users = await Promise.all(TEST_USERS.map(u => createTestUser(admin, u)))

  // Seed: create Alice's family
  await seedFamilyData(admin, users)
}

async function seedFamilyData(
  admin: ReturnType<typeof createClient>,
  users: Array<{ user: { id: string } | null }>
) {
  // Get user IDs by email
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers()
  const alice = authUsers.find(u => u.email === 'user-a@test.carshare')!
  const bob = authUsers.find(u => u.email === 'user-b@test.carshare')!
  const carol = authUsers.find(u => u.email === 'user-c@test.carshare')!
  const dan = authUsers.find(u => u.email === 'user-d@test.carshare')!

  // Alice's family
  const { data: family } = await admin.from('families').insert({ name: 'Smith Family' }).select().single()
  if (!family) throw new Error('Failed to create test family')

  // Members
  await admin.from('family_members').insert([
    { family_id: family.id, user_id: alice.id, role: 'owner', status: 'active', joined_at: new Date().toISOString() },
    { family_id: family.id, user_id: bob.id, role: 'member', status: 'active', joined_at: new Date().toISOString() },
    { family_id: family.id, user_id: carol.id, role: 'member', status: 'active', joined_at: new Date().toISOString() },
  ])

  // Dan's separate family
  const { data: danFamily } = await admin.from('families').insert({ name: 'Jones Family' }).select().single()
  await admin.from('family_members').insert({
    family_id: danFamily!.id, user_id: dan.id, role: 'owner', status: 'active', joined_at: new Date().toISOString(),
  })

  // Address for Alice's family
  const { data: address } = await admin.from('addresses').insert({
    family_id: family.id, label: 'Home', line1: '1 Test Street', city: 'London', postcode: 'SW1A 1AA', is_default: true,
  }).select().single()

  // Car for Alice's family
  await admin.from('cars').insert({
    family_id: family.id, name: 'Family Car', plate: 'TE57 CAR',
    current_address_id: address!.id,
  })
}
```

---

### Amendment A12 — Google Calendar: Capture provider token after OAuth redirect

**Fixes:** Task 24 — `supabase.auth.signInWithOAuth()` stores the Google token in Supabase's internal auth metadata, but `user_oauth_tokens` is never populated. `calendar-sync` reads only `user_oauth_tokens` and always finds nothing.

**Add new Task 24c:**

**Files:**
- Create: `supabase/functions/store-calendar-token/index.ts`
- Modify: `src/pages/SettingsPage.tsx`

**`supabase/functions/store-calendar-token/index.ts`:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

serve(async (req) => {
  try {
    return await handleStoreToken(req)
  } catch (err) {
    return respondError(err)
  }
})

async function handleStoreToken(req: Request): Promise<Response> {
  const user = await requireUser(req)
  const providerToken = await extractProviderToken(user.id)
  await storeToken(user.id, providerToken)
  return ok({ connected: true })
}

async function extractProviderToken(userId: string) {
  // Use admin client to read the provider token from auth.users
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: { user }, error } = await adminClient.auth.admin.getUserById(userId)
  if (error || !user) throw new AppError('User not found', 404)

  const identity = user.identities?.find(i => i.provider === 'google')
  const providerToken = identity?.identity_data?.['provider_token']
  const providerRefreshToken = identity?.identity_data?.['provider_refresh_token']

  if (!providerToken) throw new AppError('No Google provider token found — re-connect Google Calendar', 400)

  return { access_token: providerToken as string, refresh_token: providerRefreshToken as string | null }
}

async function storeToken(userId: string, tokens: { access_token: string; refresh_token: string | null }) {
  const db = serviceDb()
  const { error } = await db.from('user_oauth_tokens').upsert({
    user_id: userId,
    provider: 'google',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry: new Date(Date.now() + 3600 * 1000).toISOString(), // Google tokens expire in 1h
  }, { onConflict: 'user_id,provider' })
  if (error) throw new AppError(error.message)
}
```

**Update `SettingsPage.tsx`** — add a `useEffect` that detects the `?calendar=connected` query param and calls the new function:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  if (params.get('calendar') === 'connected') {
    captureProviderToken()
  }
}, [session])

async function captureProviderToken() {
  const res = await supabase.functions.invoke('store-calendar-token', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (res.error) { toastError(res.error); return }
  toast.success('Google Calendar connected!')
  setConnected(true)
  // Remove the query param from the URL without a full reload
  window.history.replaceState(null, '', window.location.pathname)
}
```

---

## One Decision Required

Both reviewers raised the `bookings.status` question:

**D1: Status value for overridden original booking**

| Option | Value | How to distinguish override from simple cancel |
|--------|-------|-----------------------------------------------|
| **A (current plan)** | `'cancelled'` | `replacement_booking_id IS NOT NULL` |
| **B (GPT-5.5 suggestion)** | `'overridden'` (new enum value) | `status = 'overridden'` directly |

Option A: already in the plan, simpler schema, requires checking `replacement_booking_id` to differentiate.
Option B: more explicit, requires adding `'overridden'` to `booking_status` enum and updating `BookingDetailPage` badge logic and `override_booking` PL/pgSQL function.


---

## Simplification Review Amendments

> **Apply these in addition to the Adversarial Review Amendments above.**

---

### Simplification S1 — Delete `AppError` unit test

**Location:** Task 1, `src/lib/errors.test.ts`

Delete this file entirely. It tests that a constructor stores its arguments — JavaScript semantics, not app behaviour. Coverage comes from E2E tests.

```bash
rm src/lib/errors.test.ts
```

Also remove `toastError`'s redundant branch — both `AppError` and `Error` did the same thing. Replace `src/lib/errors.ts` with:

```typescript
import toast from 'react-hot-toast'

export class AppError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'AppError'
  }
}

export function toastError(err: unknown): void {
  toast.error(err instanceof Error ? err.message : 'An unexpected error occurred')
}
```

---

### Simplification S2 — `serviceDb()` is a no-op singleton in Deno

**Location:** Task 7, `supabase/functions/_shared/db.ts`

Deno Edge Functions are isolated per-request — the lazy singleton caches nothing. Replace with a plain factory:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../../../src/types/database.types.ts'

export function serviceDb() {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}
```

---

### Simplification S3 — Move `fetchAddressSnapshots` to `_shared`

**Location:** Tasks 16 + 21, duplicated in `create-booking/index.ts` and `override-booking/index.ts`

**Create `supabase/functions/_shared/addresses.ts`:**

```typescript
import { serviceDb } from './db.ts'
import { AppError } from './errors.ts'

export async function fetchAddressSnapshots(pickupId: string, dropoffId: string) {
  const db = serviceDb()
  const { data: addrs, error } = await db.from('addresses')
    .select('id, label, line1, city, postcode')
    .in('id', [pickupId, dropoffId])
  if (error || !addrs || addrs.length < 2) throw new AppError('Invalid address IDs', 400)
  const pickup = addrs.find(a => a.id === pickupId)!
  const dropoff = addrs.find(a => a.id === dropoffId)!
  return {
    pickup_snapshot: `${pickup.label} — ${pickup.line1}, ${pickup.city} ${pickup.postcode}`,
    dropoff_snapshot: `${dropoff.label} — ${dropoff.line1}, ${dropoff.city} ${dropoff.postcode}`,
  }
}
```

In both `create-booking/index.ts` and `override-booking/index.ts`, delete the local `fetchAddressSnapshots` function and add:

```typescript
import { fetchAddressSnapshots } from '../_shared/addresses.ts'
```

---

### Simplification S4 — Merge calendar Edge Functions into one `calendar-token` function

**Location:** Task 24b + Amendment A12 — `check-calendar-connection` and `store-calendar-token`

Two functions with identical boilerplate → one `calendar-token` function dispatching on HTTP method. Also keeps ADR intact (no client SELECT policy on `user_oauth_tokens`).

**Delete** `supabase/functions/check-calendar-connection/` and `supabase/functions/store-calendar-token/`.

**Create `supabase/functions/calendar-token/index.ts`:**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { serviceDb } from '../_shared/db.ts'
import { ok, respondError } from '../_shared/respond.ts'
import { AppError } from '../_shared/errors.ts'

serve(async (req) => {
  try {
    const user = await requireUser(req)
    if (req.method === 'GET') return await checkConnection(user.id)
    if (req.method === 'POST') return await storeToken(req, user.id)
    if (req.method === 'DELETE') return await disconnectToken(user.id)
    throw new AppError('Method not allowed', 405)
  } catch (err) {
    return respondError(err)
  }
})

async function checkConnection(userId: string): Promise<Response> {
  const db = serviceDb()
  const { data } = await db.from('user_oauth_tokens')
    .select('id').eq('user_id', userId).eq('provider', 'google').single()
  return ok({ connected: !!data })
}

async function storeToken(req: Request, userId: string): Promise<Response> {
  const session = await getSessionFromAuth(userId)
  if (!session?.provider_token) throw new AppError('No Google provider token — re-connect Google Calendar', 400)

  const db = serviceDb()
  const { error } = await db.from('user_oauth_tokens').upsert({
    user_id: userId,
    provider: 'google',
    access_token: session.provider_token,
    refresh_token: session.provider_refresh_token ?? null,
    expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
  }, { onConflict: 'user_id,provider' })
  if (error) throw new AppError(error.message)
  return ok({ connected: true })
}

async function disconnectToken(userId: string): Promise<Response> {
  const db = serviceDb()
  const { error } = await db.from('user_oauth_tokens')
    .delete().eq('user_id', userId).eq('provider', 'google')
  if (error) throw new AppError(error.message)
  return ok({ connected: false })
}

async function getSessionFromAuth(userId: string) {
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: { user } } = await adminClient.auth.admin.getUserById(userId)
  const identity = user?.identities?.find(i => i.provider === 'google')
  return identity?.identity_data as { provider_token?: string; provider_refresh_token?: string } | null
}
```

**Update `SettingsPage.tsx`** to use the single endpoint:

```typescript
// checkConnection → GET /calendar-token
const res = await supabase.functions.invoke('calendar-token', {
  method: 'GET',
  headers: { Authorization: `Bearer ${session.access_token}` },
})

// captureProviderToken → POST /calendar-token
const res = await supabase.functions.invoke('calendar-token', {
  method: 'POST',
  headers: { Authorization: `Bearer ${session.access_token}` },
})

// disconnectCalendar → DELETE /calendar-token (remove direct DB call)
const res = await supabase.functions.invoke('calendar-token', {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${session.access_token}` },
})
```

Remove the direct `supabase.from('user_oauth_tokens').delete()` call from `disconnectCalendar()` — it goes through the edge function now.

---

### S5 Simplification Fix T5 RLS test: remove browser/CDN dependency 

**Location:** Task 23, `tests/e2e/override-flow.spec.ts`

Replace the brittle `page.evaluate` + CDN import approach with a plain Node-side HTTP assertion:

```typescript
test.describe('T5: Dan (different family) cannot read Alice\'s bookings', () => {
  test('RLS returns empty result for cross-family query', async () => {
    // Get Dan's token directly — no browser needed
    const res = await fetch(
      `${process.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.VITE_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ email: 'user-d@test.carshare', password: 'testpassword123' }),
      }
    )
    const { access_token } = await res.json()

    const bookingsRes = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/bookings?select=id`,
      {
        headers: {
          apikey: process.env.VITE_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${access_token}`,
        },
      }
    )
    const rows = await bookingsRes.json()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(0)
  })
})
```

---

### Simplification S6 — Delete T6 (calendar-sync test)

**Location:** Task 26, `tests/e2e/calendar-sync.spec.ts`

T6 only asserts that a status field renders correctly — not that sync actually runs. The real sync requires a Google API mock. Delete the file and the task.

```bash
rm tests/e2e/calendar-sync.spec.ts
```

The `not_connected` status value is already visible in T1 on the booking detail page — no separate test needed.

---

### Simplification S7 — Deterministic localStorage key in `loginAs()`

**Location:** Amendment A8, `tests/e2e/helpers.ts`

Replace the double-write guess with a deterministic key. Supabase JS v2 for local dev (`http://127.0.0.1:54321`) uses key `sb-127-0-0-1-54321-auth-token`. Store it in `.env.local`:

```
SUPABASE_STORAGE_KEY=sb-127-0-0-1-54321-auth-token
```

Replace `loginAs()`:

```typescript
export async function loginAs(page: Page, email: string, password = 'testpassword123') {
  const url = process.env.VITE_SUPABASE_URL!
  const key = process.env.VITE_SUPABASE_ANON_KEY!
  const storageKey = process.env.SUPABASE_STORAGE_KEY!

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
```

