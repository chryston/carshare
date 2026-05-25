import { Navigate } from 'react-router-dom'
import { useSession, useAuthLoading } from '../contexts/AuthContext'
import { ReactNode } from 'react'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const session = useSession()
  const loading = useAuthLoading()
  if (loading) return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="spinner-border text-primary" />
    </div>
  )
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
