import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/AuthContext'
import { toastError } from '../lib/errors'
import toast from 'react-hot-toast'

export function SettingsPage() {
  const session = useSession()
  const [disconnecting, setDisconnecting] = useState(false)

  async function disconnectCalendar() {
    setDisconnecting(true)
    try {
      const { error } = await supabase.functions.invoke('calendar-token', {
        method: 'DELETE',
      })
      if (error) throw error
      toast.success('Google Calendar disconnected')
    } catch (err) {
      toastError(err)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="row justify-content-center">
      <div className="col-md-6">
        <h2 className="mb-4">Settings</h2>

        <div className="card p-4 mb-4">
          <h5 className="mb-3">Account</h5>
          <p className="text-muted mb-0">{session?.user.email}</p>
        </div>

        <div className="card p-4">
          <h5 className="mb-3">Google Calendar</h5>
          <p className="text-muted mb-3">
            Connect your Google Calendar to sync CarShare bookings automatically.
          </p>
          <button
            className="btn btn-outline-danger"
            disabled={disconnecting}
            onClick={disconnectCalendar}
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect Google Calendar'}
          </button>
        </div>
      </div>
    </div>
  )
}
