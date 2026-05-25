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
