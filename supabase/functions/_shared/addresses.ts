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
