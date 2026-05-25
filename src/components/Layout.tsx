import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFamily } from '../contexts/FamilyContext'

export function Layout() {
  const { family } = useFamily()
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
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
