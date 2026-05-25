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
