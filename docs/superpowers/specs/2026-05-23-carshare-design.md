# CarShare — Spec-Driven Development Document

**Date:** 2026-05-23  
**Author:** Copilot (Spec-Driven Development session)  
**Status:** Draft — Pending Adversarial Review  
**Branch:** `spec/initial-sdd`

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Scope & Constraints](#2-scope--constraints)
3. [Roles & Permissions](#3-roles--permissions)
4. [Product Requirements Document (PRD)](#4-product-requirements-document-prd)
5. [System Architecture & Data Flow](#5-system-architecture--data-flow)
6. [Data Models — PostgreSQL Schema](#6-data-models--postgresql-schema)
7. [Row Level Security Policy Summary](#7-row-level-security-policy-summary)
8. [Supabase Edge Functions](#8-supabase-edge-functions)
9. [Google OAuth & Calendar Integration](#9-google-oauth--calendar-integration)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Success Milestones & E2E Testing Plan](#11-success-milestones--e2e-testing-plan)
12. [Key Architectural Decisions (ADR Log)](#12-key-architectural-decisions-adr-log)

---

## 1. Problem Statement

Families with multiple drivers share one or more vehicles. Without a central coordination tool they face:

- Double-bookings and last-minute disputes over who gets the car.
- Uncertainty about where the car was parked after the last trip.
- No single source of truth for upcoming usage.

CarShare is a lightweight, zero-infrastructure web application that solves this by providing a shared family calendar for vehicle reservations, real-time car-location tracking, and conflict-free booking with owner-level override capability.

---

## 2. Scope & Constraints

| Constraint | Decision |
|---|---|
| Hosting | GitHub Pages (static export — no server process) |
| Frontend | React 18 + Vite, Bootstrap 5 (custom SaaS theme) |
| Database | Supabase (PostgreSQL, free tier) |
| Auth | Google OAuth 2.0 via Supabase Auth |
| Backend logic | Supabase Edge Functions (Deno) — no standalone Python/Node server |
| Real-time | Manual refresh / on-navigation refetch (no WebSockets in v1) |
| Calendar | Google Calendar API integration in v1 |
| Multi-car | Multiple cars per family group |
| UI priority | Mobile-first responsive |
| Routing | Hash-based (`/#/`) to support GitHub Pages without server-side routing |
| Out of scope | Push notifications, native mobile app, multi-family per user (v2+) |

---

## 3. Roles & Permissions

### Owner
Created automatically when a user creates a new family group. Only one Owner per family.

| Action | Owner |
|---|---|
| Invite/remove members | ✅ |
| Approve pending members | ✅ |
| Add/edit/delete addresses | ✅ |
| Add/edit/delete cars | ✅ |
| Create/cancel own bookings | ✅ |
| Override any member's booking | ✅ |
| View full family calendar | ✅ |

### Member
Added by Owner via email invite.

| Action | Member |
|---|---|
| Create/cancel own bookings | ✅ |
| View full family calendar | ✅ |
| Update car location after trip | ✅ |
| Override another member's booking | ❌ |
| Manage cars or addresses | ❌ |
| Invite other members | ❌ |

---

## 4. Product Requirements Document (PRD)

### 4.1 Core User Stories

#### Authentication

| ID | Story | Acceptance Criteria |
|---|---|---|
| AUTH-01 | As a user, I can sign in with my Google account | OAuth redirect works; profile row created in `profiles` on first sign-in |
| AUTH-02 | As a user, I am redirected to onboarding if I have no family | After first sign-in with no `family_members` row, redirected to `/onboarding` |
| AUTH-03 | As a user, I can sign out | Session cleared; redirected to landing page |

#### Family Management

| ID | Story | Acceptance Criteria |
|---|---|---|
| FAM-01 | As an Owner, I can create a family group with a name | Family row created; `family_members` row with `role=owner, status=active` |
| FAM-02 | As an Owner, I can invite a member by Google email | `family_members` row created with `status=pending`; invite email sent via Edge Function |
| FAM-03 | As an invited user, I can accept an invite via a link | Clicking invite link sets `status=active`, `joined_at=now()` |
| FAM-04 | As an Owner, I can remove a member | `status` set to `removed`; their future bookings cancelled |
| FAM-05 | As an Owner, I can see all members and their status | Members list page shows name, avatar, role, status |

#### Address Management

| ID | Story | Acceptance Criteria |
|---|---|---|
| ADDR-01 | As an Owner, I can add a named address (e.g. "Home") | Address row created with label + address_line |
| ADDR-02 | As an Owner, I can edit or delete an address | Edit updates row; delete only allowed if not referenced by future bookings |
| ADDR-03 | All family members can see family addresses | Available in booking pickup/drop-off dropdowns |

#### Car Management

| ID | Story | Acceptance Criteria |
|---|---|---|
| CAR-01 | As an Owner, I can register a car (nickname + plate) | Car row created, linked to family |
| CAR-02 | As an Owner, I can edit or delete a car | Delete only if no active/future bookings exist |
| CAR-03 | All members can see the car list and each car's current location | Car list shows nickname, plate, current location label + notes |
| CAR-04 | As any active member (including Owner), I can update a car's location after my trip | `current_location_id`, `current_location_notes`, `location_updated_at`, `location_updated_by` updated |

#### Booking Management

| ID | Story | Acceptance Criteria |
|---|---|---|
| BOOK-01 | As a Member, I can create a booking for a car | Form: car, start/end datetime, pickup address, drop-off address, description. Calls Edge Function `/create-booking` |
| BOOK-02 | Booking is rejected if a confirmed booking overlaps for the same car | Edge Function returns 409 with conflict details (who booked, what time); UI shows clear error |
| BOOK-03 | As a Member, I can cancel my own future booking | Status set to `cancelled` |
| BOOK-04 | As an Owner, I can override (reassign) any confirmed booking | Original booking status → `overridden`, `overridden_by` set; new booking created for the Owner |
| BOOK-05 | All family members can see the full booking calendar | Calendar view (week/month) showing all confirmed bookings for all cars |
| BOOK-06 | As a Member, I can see my own bookings in a list view | Personal bookings list, filterable by status |

#### Google Calendar Sync

| ID | Story | Acceptance Criteria |
|---|---|---|
| CAL-01 | As a Member, I can connect my Google Calendar | OAuth consent grants `calendar.events` scope; refresh token stored encrypted in `profiles.google_calendar_token` |
| CAL-02 | When a booking is confirmed, an event is created in my calendar | Edge Function `/calendar-sync` called after booking creation; `google_calendar_event_id` stored on booking |
| CAL-03 | When a booking is cancelled or overridden, the calendar event is deleted | Edge Function called with event ID; event removed from Google Calendar |
| CAL-04 | As a Member, I can disconnect my Google Calendar | `google_calendar_token` set to NULL; no further syncs |

### 4.2 Edge Case Handling

| Scenario | Handling |
|---|---|
| Two members submit overlapping bookings simultaneously | Advisory lock in Edge Function prevents race condition; second writer receives 409 |
| Owner overrides booking already synced to Google Calendar | Override Edge Function deletes original calendar event; creates new one for Owner |
| Member removed from family mid-booking | Their `status → removed`; all their future bookings cancelled; Edge Function deletes their calendar events |
| Car deleted with future bookings | Deletion blocked; Owner must cancel all future bookings first |
| Address deleted referenced in future booking | Deletion blocked; address_line is preserved on existing bookings via a snapshot column |
| Google Calendar token expires | Edge Function detects 401, uses refresh token; if refresh fails, marks `google_calendar_token=NULL` and returns error code to UI |
| User has no family | Post-login redirect to `/onboarding` — create or join a family |
| Invite link clicked by wrong Google account | Edge Function validates email match; returns 403 if mismatch |

---

## 5. System Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Pages (CDN)                           │
│                 React + Vite SPA (static)                       │
│   Bootstrap 5 │ React Router (hash) │ Supabase JS Client v2    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase                                 │
│  ┌──────────────┐  ┌────────────────────┐  ┌────────────────┐  │
│  │  Auth        │  │  PostgreSQL + RLS  │  │ Edge Functions │  │
│  │  Google OAuth│  │  profiles          │  │ (Deno)         │  │
│  │  JWT tokens  │  │  families          │  │                │  │
│  └──────────────┘  │  family_members    │  │ /create-booking│  │
│                    │  addresses         │  │ /override-     │  │
│                    │  cars              │  │   booking      │  │
│                    │  bookings          │  │ /calendar-sync │  │
│                    └────────────────────┘  │ /invite-member │  │
└──────────────────────────────────────────────────────────────────┘
                           │
                           │ OAuth 2.0 + REST
                           ▼
┌──────────────────────────────────────────────────┐
│                Google APIs                       │
│   Google OAuth 2.0    │    Google Calendar API   │
└──────────────────────────────────────────────────┘
```

### 5.1 Booking Creation Data Flow

```
User fills booking form
        │
        ▼
React calls supabase.functions.invoke('create-booking', { body })
        │
        ▼
Edge Function: create-booking
  1. Verify JWT → extract user_id
  2. Confirm user is active member of family_id
  3. Acquire pg_try_advisory_xact_lock(car_id_hash, epoch_start)
  4. SELECT count(*) FROM bookings WHERE car_id = ? AND status = 'confirmed'
     AND tstzrange(start_time, end_time) && tstzrange(req.start, req.end)
  5. If count > 0 → return 409 { conflict: { user, start, end } }
  6. INSERT INTO bookings (...) RETURNING *
  7. If user has google_calendar_token → invoke calendar-sync
  8. Return 201 { booking }
        │
        ▼
React updates UI (refetch bookings list)
```

### 5.2 Auth Flow

```
User clicks "Sign in with Google"
        │
        ▼
supabase.auth.signInWithOAuth({ provider: 'google' })
        │  (redirect to Google consent)
        ▼
Google redirects back to GitHub Pages URL with code
        │
        ▼
Supabase exchanges code for JWT + refresh token
        │
        ▼
Supabase trigger: on auth.users INSERT → INSERT INTO profiles(id, full_name, avatar_url)
        │
        ▼
React onAuthStateChange → check family_members → redirect to /dashboard or /onboarding
```

---

## 6. Data Models — PostgreSQL Schema

```sql
-- ─────────────────────────────────────────────────────────────
-- profiles
-- Extended user record. Created automatically via DB trigger
-- on auth.users insert.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name               TEXT,
  avatar_url              TEXT,
  google_calendar_token   JSONB,          -- { access_token, refresh_token, expiry }
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- families
-- ─────────────────────────────────────────────────────────────
CREATE TABLE families (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- family_members
-- ─────────────────────────────────────────────────────────────
CREATE TABLE family_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'removed')),
  invited_email TEXT,                     -- email used for invite validation
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at   TIMESTAMPTZ,
  UNIQUE (family_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- addresses
-- Managed by Owner; used as pickup/drop-off in bookings.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,            -- "Home", "Dad's Office", "School"
  address_line  TEXT NOT NULL,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- cars
-- ─────────────────────────────────────────────────────────────
CREATE TABLE cars (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                 UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  nickname                  TEXT NOT NULL,
  plate_number              TEXT NOT NULL,
  current_location_id       UUID REFERENCES addresses(id) ON DELETE SET NULL,
  current_location_notes    TEXT,         -- free text: "Level 3, Bay 42"
  location_updated_at       TIMESTAMPTZ,
  location_updated_by       UUID REFERENCES profiles(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- bookings
-- ─────────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                 UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  car_id                    UUID NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
  user_id                   UUID NOT NULL REFERENCES profiles(id),
  start_time                TIMESTAMPTZ NOT NULL,
  end_time                  TIMESTAMPTZ NOT NULL,
  pickup_address_id         UUID REFERENCES addresses(id) ON DELETE SET NULL,
  dropoff_address_id        UUID REFERENCES addresses(id) ON DELETE SET NULL,
  -- Snapshot of address text at time of booking (preserved if address deleted)
  pickup_address_snapshot   TEXT,
  dropoff_address_snapshot  TEXT,
  description               TEXT,
  status                    TEXT NOT NULL DEFAULT 'confirmed'
                              CHECK (status IN ('confirmed', 'cancelled', 'overridden')),
  overridden_by             UUID REFERENCES profiles(id),
  overridden_at             TIMESTAMPTZ,
  google_calendar_event_id  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Index for conflict detection queries
CREATE INDEX idx_bookings_car_time
  ON bookings (car_id, start_time, end_time)
  WHERE status = 'confirmed';

-- ─────────────────────────────────────────────────────────────
-- DB Trigger: create profile on new auth user
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 7. Row Level Security Policy Summary

All tables have RLS enabled. The core predicate is: **"the authenticated user must be an active member of the row's `family_id`."**

```sql
-- Helper function (used in all RLS policies)
CREATE OR REPLACE FUNCTION is_family_member(fid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = fid
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_family_owner(fid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = fid
      AND user_id = auth.uid()
      AND role = 'owner'
      AND status = 'active'
  );
$$;
```

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | own row only | — (trigger) | own row only | — |
| `families` | is_family_member | any auth user | is_family_owner | is_family_owner |
| `family_members` | is_family_member | is_family_owner | is_family_owner | is_family_owner |
| `addresses` | is_family_member | is_family_owner | is_family_owner | is_family_owner |
| `cars` | is_family_member | is_family_owner | is_family_owner OR own location update | is_family_owner |
| `bookings` | is_family_member | is_family_member (via Edge Fn) | own row OR is_family_owner | — (soft cancel via status) |

> **Note:** `bookings` INSERT goes through the Edge Function (`SECURITY DEFINER`), which performs the conflict check atomically. Direct client inserts to `bookings` are blocked by RLS to prevent conflict-check bypasses.

---

## 8. Supabase Edge Functions

All Edge Functions are Deno-based, deployed to Supabase, and called via `supabase.functions.invoke()` from the React client.

### `POST /create-booking`

**Purpose:** Atomically check for conflicts and insert a booking.

```
Request body:
  car_id, family_id, start_time, end_time,
  pickup_address_id, dropoff_address_id, description

Steps:
  1. Verify Bearer JWT → user_id
  2. Assert user is active member of family_id
  3. pg_try_advisory_xact_lock(hashtext(car_id::text))
  4. Overlap query on bookings (status=confirmed, same car_id)
  5. If conflict → 409 { error: 'BOOKING_CONFLICT', conflicting_booking: { ... } }
  6. INSERT booking + populate address snapshots
  7. If user has google_calendar_token → call /calendar-sync internally
  8. 201 { booking }
```

### `POST /override-booking`

**Purpose:** Owner cancels an existing booking and optionally creates a replacement.

```
Request body:
  booking_id, reason?, new_booking? (optional replacement payload)

Steps:
  1. Verify JWT → assert is_family_owner
  2. UPDATE bookings SET status='overridden', overridden_by, overridden_at
  3. If original had google_calendar_event_id → delete calendar event
  4. If new_booking provided → call /create-booking logic
  5. 200 { overridden_booking, new_booking? }
```

### `POST /calendar-sync`

**Purpose:** Create, update, or delete a Google Calendar event for a booking.

```
Request body:
  action: 'create' | 'delete'
  booking_id
  user_id (whose calendar to update)

Steps:
  1. Fetch user's google_calendar_token from profiles
  2. If token expired → use refresh_token to get new access_token; update DB
  3. If refresh fails → set google_calendar_token=NULL; return { error: 'CALENDAR_TOKEN_REVOKED' }
  4. action='create' → POST to Calendar API events.insert
     - Title: "{nickname} — {description}"
     - Start/end from booking
     - Location: pickup_address_snapshot
  5. action='delete' → DELETE calendar API events.delete(event_id)
  6. UPDATE bookings SET google_calendar_event_id = event_id (on create)
  7. 200 { event_id? }
```

### `POST /invite-member`

**Purpose:** Create a pending `family_members` row and send invite email.

```
Request body:
  family_id, invited_email

Steps:
  1. Verify JWT → assert is_family_owner
  2. Check invited_email not already active member
  3. INSERT family_members (status='pending', invited_email)
  4. Generate signed invite URL: /accept-invite?token=<signed_jwt>
  5. Send email via Supabase SMTP (or Resend API)
  6. 201 { member_id }
```

### `POST /accept-invite`

**Purpose:** Activate a pending invite for the currently logged-in user.

```
Request body:
  token (signed JWT from invite email)

Steps:
  1. Verify invite token (signed with SUPABASE_JWT_SECRET)
  2. Assert token.email === auth user's Google email
  3. UPDATE family_members SET status='active', user_id=auth.uid(), joined_at=now()
  4. 200 { family_id }
```

---

## 9. Google OAuth & Calendar Integration

### 9.1 Auth Setup

Supabase Auth is configured with Google as the OAuth provider. The consent screen requests:

- `openid`, `profile`, `email` — for identity
- `https://www.googleapis.com/auth/calendar.events` — for calendar sync

The calendar scope is requested incrementally: only prompted when the user explicitly clicks "Connect Google Calendar" in Settings. This avoids alarming new users with overly broad consent on first sign-in.

### 9.2 Token Storage

| Field | Location | Notes |
|---|---|---|
| `access_token` | `profiles.google_calendar_token` JSONB | Encrypted at rest by Supabase |
| `refresh_token` | `profiles.google_calendar_token` JSONB | Required for server-side refresh in Edge Function |
| `expiry` | `profiles.google_calendar_token` JSONB | ISO timestamp; checked before each API call |

The Edge Function reads/writes this field using the Supabase service role key (not exposed to client).

### 9.3 Incremental Auth Flow

```
User navigates to Settings → "Connect Google Calendar"
        │
        ▼
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { scopes: 'https://www.googleapis.com/auth/calendar.events',
             access_type: 'offline' }
})
        │
        ▼
Supabase stores tokens; React calls /calendar-sync?action=verify
        │
        ▼
UI shows "Calendar connected ✓"
```

---

## 10. Frontend Architecture

### 10.1 Page Structure

```
/                    → Landing (sign-in CTA)
/#/onboarding        → Create or join a family (post-login, no family exists)
/#/accept-invite     → Accept invite token from email (calls /accept-invite Edge Fn)
/#/dashboard         → Family overview: cars + upcoming bookings
/#/calendar          → Full family calendar (week/month toggle)
/#/bookings/new      → Create booking form
/#/bookings/:id      → Booking detail
/#/cars              → Car list + location status
/#/cars/:id          → Car detail + update location
/#/addresses         → Address list (Owner only)
/#/members           → Family members list (Owner only)
/#/settings          → User settings + Google Calendar connect/disconnect
```

### 10.2 Component Hierarchy

```
App
├── AuthProvider (Supabase session context)
├── FamilyProvider (active family + members context)
├── Layout
│   ├── Navbar (mobile-first: hamburger menu)
│   └── <Outlet>
│       ├── DashboardPage
│       │   ├── CarStatusCard[]
│       │   └── UpcomingBookingsList
│       ├── CalendarPage
│       │   └── BookingCalendar (week/month, per-car colour coding)
│       ├── BookingFormPage
│       │   └── BookingForm (car, datetime, addresses, description)
│       ├── CarsPage / CarDetailPage
│       ├── AddressesPage (Owner only)
│       ├── MembersPage (Owner only)
│       └── SettingsPage
```

### 10.3 State Management

- **Server state:** Supabase JS client queries (no Redux/Zustand — queries are simple enough for local component state + React context).
- **Auth state:** `AuthProvider` wraps `supabase.auth.onAuthStateChange`.
- **Family context:** `FamilyProvider` fetches active family + members after auth; propagated via context.
- **Forms:** React Hook Form for booking and address forms.
- **Notifications:** Toast library (e.g. react-hot-toast) for success/error feedback.

### 10.4 Routing & GitHub Pages

- Vite builds to `dist/`. GitHub Pages serves static files.
- React Router uses **hash routing** (`createHashRouter`) — no server-side redirect needed.
- Supabase OAuth redirect URL set to `https://<username>.github.io/<repo>/` (exact match required in Supabase Dashboard + Google Cloud Console).

---

## 11. Success Milestones & E2E Testing Plan

### Milestones

| Milestone | Description | Done When |
|---|---|---|
| M1 — Auth + Family | Google sign-in, create/join family, invite/accept member flow | Auth works end-to-end; two test accounts can be in the same family |
| M2 — Cars & Addresses | Owner adds cars + addresses; members see them; location update works | Car list shows current location; member can update after "trip" |
| M3 — Booking Core | Create/cancel bookings; conflict detection fires | Overlapping booking returns 409 with conflict info; no race condition |
| M4 — Owner Override | Owner reassigns a confirmed booking | Overridden booking shows correct status; audit fields populated |
| M5 — Calendar Sync | Google Calendar connect; create/cancel syncs events | Event appears in Google Calendar; cancel removes it |
| M6 — Deploy | Live on GitHub Pages with production Supabase project | URL accessible; OAuth redirect works; all M1–M5 features verified |

### E2E Test Scenarios

#### T1 — Happy Path (Full Booking Lifecycle)

```
1. User A signs in with Google → profile created → onboarding shown
2. User A creates family "Smith Family"
3. User A adds address "Home" and registers car "Blue Honda"
4. User A invites User B via email
5. User B accepts invite → dashboard shown
6. User B creates booking: Blue Honda, tomorrow 9am–11am
7. User B sees booking on calendar
8. User B marks car location as "Home" after trip
9. User A sees updated car location on dashboard
```

#### T2 — Conflict Detection

```
1. User B creates booking: Blue Honda, Friday 2pm–4pm
2. User C (same family) attempts: Blue Honda, Friday 3pm–5pm
3. Expected: 409 response, UI shows "Blue Honda is already booked by [User B] from 2pm–4pm"
4. User C books a non-overlapping slot (Friday 4pm–6pm) → succeeds
```

#### T3 — Race Condition (Concurrent Bookings)

```
1. Two browser tabs simultaneously submit identical overlapping bookings
2. Expected: exactly one succeeds (201), one fails (409)
3. Advisory lock ensures no double-insert
```

#### T4 — Owner Override

```
1. User B has confirmed booking: Blue Honda, Saturday 10am–12pm
2. Owner (User A) overrides the booking
3. Expected:
   - User B's booking status → 'overridden'
   - overridden_by = User A's id
   - If User B had calendar sync: event deleted from their calendar
```

#### T5 — RLS Isolation

```
1. User D is in "Jones Family" (different family)
2. User D queries bookings table directly via Supabase JS client
3. Expected: 0 rows returned (RLS blocks cross-family access)
```

#### T6 — Google Calendar Sync

```
1. User B connects Google Calendar in Settings
2. User B creates a booking
3. Expected: event appears in User B's Google Calendar
4. User B cancels booking
5. Expected: event removed from Google Calendar
```

#### T7 — Token Refresh

```
1. User B's google_calendar_token is expired (simulate by backdating expiry)
2. User B creates a booking
3. Expected: Edge Function refreshes token silently; event created normally
4. Simulate refresh failure (revoke token in Google settings)
5. Expected: booking created successfully; calendar sync fails gracefully;
   UI shows "Calendar sync failed — reconnect in Settings"
```

---

## 12. Key Architectural Decisions (ADR Log)

| ADR | Decision | Rationale |
|---|---|---|
| ADR-01 | GitHub Pages + Supabase, no backend server | Zero infrastructure debt; free tier covers family-scale usage |
| ADR-02 | Conflict check in Edge Function, not client-side | Prevents race conditions; client-side check is non-atomic |
| ADR-03 | Hash-based routing | GitHub Pages cannot rewrite URLs; hash routing requires no server config |
| ADR-04 | RLS blocks direct INSERT to bookings | Prevents conflict-check bypass; all booking mutations go through Edge Fn |
| ADR-05 | Incremental Google Calendar auth | Requesting `calendar.events` scope on first login increases friction; better to request on demand |
| ADR-06 | Address snapshot on bookings | Allows addresses to be deleted without breaking historical booking records |
| ADR-07 | Manual refresh over WebSockets | Simpler implementation; family-scale usage doesn't require real-time for v1 |
| ADR-08 | Multiple cars per family | Future-proofs for households with 2+ vehicles |
| ADR-09 | Optimistic + Owner Override conflict resolution | Balances user autonomy (first-come) with admin control (owner override) |
| ADR-10 | google_calendar_token stored in profiles (JSONB) | Avoids a separate tokens table; encrypted at rest; only accessible server-side via service role |
