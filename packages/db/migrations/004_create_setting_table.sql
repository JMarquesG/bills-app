-- Migration: Create setting table
-- Description: Creates the setting table for storing application configuration
-- Date: 2024-01-01

CREATE TABLE IF NOT EXISTS setting (
  id INTEGER PRIMARY KEY,
  data_root TEXT, -- Single root folder for all app data
  bills_root TEXT, -- Legacy - kept for migration
  expenses_root TEXT, -- Legacy - kept for migration
  filename_tpl TEXT,
  security TEXT, -- JSON string: { hasPassword: boolean, salt: string, hash: string } or null
  company_profile TEXT, -- JSON string: seller profile (name, address, tax ids, bank)
  smtp_config TEXT, -- JSON string: { host: string, port: number, secure: boolean, user: string, password: string } or null
  openai_key TEXT, -- JSON string: { algo: string, iv: string, cipherText: string } or null
  ai_backend TEXT DEFAULT 'local', -- AI backend: 'local' | 'openai' | 'ollama'
  supabase_url TEXT, -- Cloud sync: Supabase project URL
  supabase_key TEXT, -- Cloud sync: encrypted anon/service key payload JSON
  supabase_sync_enabled BOOLEAN DEFAULT FALSE, -- Whether cloud sync is enabled
  last_sync_at TIMESTAMPTZ, -- Last successful sync timestamp (UTC)
  supabase_conflict_policy TEXT DEFAULT 'cloud_wins', -- 'cloud_wins' | 'local_wins'
  supabase_db_url TEXT, -- Optional direct Postgres URL for schema bootstrap
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_setting_ai_backend ON setting(ai_backend);
CREATE INDEX IF NOT EXISTS idx_setting_supabase_sync_enabled ON setting(supabase_sync_enabled);
CREATE INDEX IF NOT EXISTS idx_setting_last_sync_at ON setting(last_sync_at);

-- Add RLS (Row Level Security) policies if needed
-- ALTER TABLE setting ENABLE ROW LEVEL SECURITY;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_setting_updated_at 
  BEFORE UPDATE ON setting 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to ensure valid AI backend values
ALTER TABLE setting ADD CONSTRAINT check_ai_backend_valid 
  CHECK (ai_backend IN ('local', 'openai', 'ollama'));

-- Add constraint to ensure valid conflict policy values
ALTER TABLE setting ADD CONSTRAINT check_conflict_policy_valid 
  CHECK (supabase_conflict_policy IN ('cloud_wins', 'local_wins'));

-- Insert default setting record if it doesn't exist
INSERT INTO setting (id, ai_backend, supabase_sync_enabled, supabase_conflict_policy) 
VALUES (1, 'local', FALSE, 'cloud_wins')
ON CONFLICT (id) DO NOTHING;
