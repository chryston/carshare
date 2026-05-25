-- supabase/migrations/001_initial.sql

-- Profiles (mirrors auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Families
CREATE TABLE families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Family members
-- NOTE: No UNIQUE(family_id, user_id) constraint — per Amendment A1, rely on partial indexes below
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'removed')),
  invited_email TEXT,
  invite_token_hash TEXT,
  invite_expires_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ
);

-- Amendment A1: Two partial indexes (replaces broken UNIQUE(family_id, user_id))
-- Only one active owner per family
CREATE UNIQUE INDEX idx_family_owner ON family_members(family_id)
  WHERE role = 'owner' AND status = 'active';

-- Prevent duplicate active/pending user memberships (allows re-invite after 'removed')
CREATE UNIQUE INDEX idx_family_members_active ON family_members(family_id, user_id)
  WHERE status != 'removed' AND user_id IS NOT NULL;

-- Prevent duplicate pending invites to the same email in the same family
CREATE UNIQUE INDEX idx_family_members_pending_email ON family_members(family_id, invited_email)
  WHERE status = 'pending' AND invited_email IS NOT NULL;

-- Addresses
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  postcode TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

-- Helper: is current user an active member of a family?
CREATE OR REPLACE FUNCTION is_family_member(fid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = fid AND user_id = auth.uid() AND status = 'active'
  );
$$;

-- Helper: is current user an active owner of a family?
CREATE OR REPLACE FUNCTION is_family_owner(fid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = fid AND user_id = auth.uid() AND role = 'owner' AND status = 'active'
  );
$$;

-- Profiles: own profile readable by self; family members can see each other
CREATE POLICY "own profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "family profiles" ON profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM family_members fm1
    JOIN family_members fm2 ON fm1.family_id = fm2.family_id
    WHERE fm1.user_id = auth.uid() AND fm2.user_id = profiles.id
      AND fm1.status = 'active' AND fm2.status = 'active'
  )
);
CREATE POLICY "update own profile" ON profiles FOR UPDATE USING (id = auth.uid());

-- Families: members can read their family
CREATE POLICY "read own family" ON families FOR SELECT USING (is_family_member(id));

-- Amendment A2: INSERT policies for bootstrap (OnboardingPage creates family + owner member)
-- Any authenticated user can create a family
CREATE POLICY "create family" ON families
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Family members: members can see their family's member list
CREATE POLICY "read family members" ON family_members FOR SELECT USING (is_family_member(family_id));
-- Owner can update member records
CREATE POLICY "owner manages members" ON family_members FOR ALL USING (is_family_owner(family_id));

-- Amendment A2: A user can insert themselves as owner (bootstrap)
CREATE POLICY "self join as owner" ON family_members
  FOR INSERT WITH CHECK (user_id = auth.uid() AND role = 'owner');

-- Addresses: all members read; owner manages
CREATE POLICY "read addresses" ON addresses FOR SELECT USING (is_family_member(family_id));
CREATE POLICY "owner manages addresses" ON addresses FOR ALL USING (is_family_owner(family_id));
