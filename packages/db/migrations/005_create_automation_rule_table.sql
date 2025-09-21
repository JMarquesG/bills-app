-- Migration: Create automation_rule table
-- Description: Creates the automation_rule table for storing automated invoice generation rules
-- Date: 2024-01-01

CREATE TABLE IF NOT EXISTS automation_rule (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  day_of_month INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  description TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  cc_emails TEXT, -- JSON array of CC email addresses
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_date DATE,
  next_due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_automation_rule_client_id ON automation_rule(client_id);
CREATE INDEX IF NOT EXISTS idx_automation_rule_is_active ON automation_rule(is_active);
CREATE INDEX IF NOT EXISTS idx_automation_rule_day_of_month ON automation_rule(day_of_month);
CREATE INDEX IF NOT EXISTS idx_automation_rule_next_due_date ON automation_rule(next_due_date);
CREATE INDEX IF NOT EXISTS idx_automation_rule_last_sent_date ON automation_rule(last_sent_date);

-- Add RLS (Row Level Security) policies if needed
-- ALTER TABLE automation_rule ENABLE ROW LEVEL SECURITY;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_automation_rule_updated_at 
  BEFORE UPDATE ON automation_rule 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to ensure amount is positive
ALTER TABLE automation_rule ADD CONSTRAINT check_automation_amount_positive CHECK (amount >= 0);

-- Add constraint to ensure day_of_month is valid
ALTER TABLE automation_rule ADD CONSTRAINT check_day_of_month_valid 
  CHECK (day_of_month >= 1 AND day_of_month <= 31);
