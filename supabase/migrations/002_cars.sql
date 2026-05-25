-- Migration 002: Cars

CREATE TABLE cars (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  make        text NOT NULL,
  model       text NOT NULL,
  year        int,
  plate       text NOT NULL,
  color       text,
  location_address_id uuid REFERENCES addresses(id) ON DELETE SET NULL,
  location_notes      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cars ENABLE ROW LEVEL SECURITY;

-- Members can view their family's cars
CREATE POLICY "members view cars"
  ON cars FOR SELECT
  USING (is_family_member(family_id));

-- Owners can insert cars
CREATE POLICY "owners insert cars"
  ON cars FOR INSERT
  WITH CHECK (is_family_owner(family_id));

-- Owners can update cars (including location)
CREATE POLICY "owners update cars"
  ON cars FOR UPDATE
  USING (is_family_owner(family_id));

-- Members can update car location (location_address_id + location_notes only)
-- Note: enforced at app layer; broad UPDATE policy for members here
CREATE POLICY "members update car location"
  ON cars FOR UPDATE
  USING (is_family_member(family_id));

-- Owners can delete cars
CREATE POLICY "owners delete cars"
  ON cars FOR DELETE
  USING (is_family_owner(family_id));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER cars_updated_at
  BEFORE UPDATE ON cars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
