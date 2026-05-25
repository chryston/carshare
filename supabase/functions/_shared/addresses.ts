import { serviceDb } from './db.ts'
import { AppError } from './errors.ts'

export async function fetchAddressSnapshots(pickupId: string, dropoffId: string) {
  const db = serviceDb()
  const ids = [...new Set([pickupId, dropoffId])]
  const { data: addrs, error } = await db.from('addresses')
    .select('id, label, line1, city, postcode')
    .in('id', ids)
  if (error) throw new AppError('Failed to fetch addresses', 500)
  const pickup = addrs?.find(a => a.id === pickupId)
  const dropoff = addrs?.find(a => a.id === dropoffId)
  if (!pickup || !dropoff) throw new AppError('Invalid address IDs', 400)
  const format = (a: typeof pickup) => `${a.label} — ${a.line1}, ${a.city} ${a.postcode}`
  return {
    pickup_snapshot: format(pickup),
    dropoff_snapshot: format(dropoff),
  }
}
