-- Migration: Create client table
-- Description: Creates the client table for storing customer/client information
-- Date: 2024-01-01

CREATE TABLE IF NOT EXISTS client (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  address TEXT,
  phone TEXT,
  hidden BOOLEAN DEFAULT FALSE,
  tax_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_client_name ON client(name);
CREATE INDEX IF NOT EXISTS idx_client_email ON client(email);
CREATE INDEX IF NOT EXISTS idx_client_hidden ON client(hidden);

-- Add RLS (Row Level Security) policies if needed
-- ALTER TABLE client ENABLE ROW LEVEL SECURITY;

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_client_updated_at 
  BEFORE UPDATE ON client 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
