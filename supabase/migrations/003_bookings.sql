-- Migration 003: Bookings + override_booking function

CREATE TABLE bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  car_id        uuid NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  booked_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  description   text,
  pickup_address_id  uuid REFERENCES addresses(id) ON DELETE SET NULL,
  dropoff_address_id uuid REFERENCES addresses(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_time_order CHECK (ends_at > starts_at)
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Members can view their family's bookings
CREATE POLICY "members view bookings"
  ON bookings FOR SELECT
  USING (is_family_member(family_id));

-- Members can insert bookings for their family
CREATE POLICY "members insert bookings"
  ON bookings FOR INSERT
  WITH CHECK (is_family_member(family_id) AND booked_by = auth.uid());

-- Members can cancel their own bookings
CREATE POLICY "members cancel own bookings"
  ON bookings FOR UPDATE
  USING (booked_by = auth.uid() AND is_family_member(family_id));

-- Owners can cancel any booking
CREATE POLICY "owners cancel any booking"
  ON bookings FOR UPDATE
  USING (is_family_owner(family_id));

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Amendment A6: Atomic cancel-and-replace function
-- Used by override-booking edge function via db.rpc('override_booking', ...)
CREATE OR REPLACE FUNCTION override_booking(
  p_cancel_id   uuid,
  p_family_id   uuid,
  p_car_id      uuid,
  p_booked_by   uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_description text,
  p_pickup_id   uuid,
  p_dropoff_id  uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_id uuid;
BEGIN
  -- Cancel the conflicting booking
  UPDATE bookings
    SET status = 'cancelled', updated_at = now()
  WHERE id = p_cancel_id
    AND family_id = p_family_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking to cancel not found or already cancelled' USING ERRCODE = '02000';
  END IF;

  -- Insert the new booking
  INSERT INTO bookings (family_id, car_id, booked_by, starts_at, ends_at, description, pickup_address_id, dropoff_address_id)
  VALUES (p_family_id, p_car_id, p_booked_by, p_starts_at, p_ends_at, p_description, p_pickup_id, p_dropoff_id)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Extension needed for mixed-type exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add exclusion constraint to prevent overlapping active bookings for same car
ALTER TABLE bookings ADD CONSTRAINT no_overlap_active_bookings
  EXCLUDE USING gist (
    car_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'active');
