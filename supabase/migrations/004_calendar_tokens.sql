-- Migration 004: Google Calendar tokens

CREATE TABLE google_calendar_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_token UNIQUE (user_id)
);

ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see their own token
CREATE POLICY "users view own token"
  ON google_calendar_tokens FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own token
CREATE POLICY "users insert own token"
  ON google_calendar_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own token
CREATE POLICY "users update own token"
  ON google_calendar_tokens FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own token
CREATE POLICY "users delete own token"
  ON google_calendar_tokens FOR DELETE
  USING (user_id = auth.uid());

CREATE TRIGGER google_calendar_tokens_updated_at
  BEFORE UPDATE ON google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
