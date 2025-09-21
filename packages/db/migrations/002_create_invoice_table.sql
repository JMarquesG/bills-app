-- Migration: Create invoice table
-- Description: Creates the invoice table for storing invoice information
-- Date: 2024-01-01

CREATE TABLE IF NOT EXISTS invoice (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  issue_date DATE NOT NULL,
  due_date DATE,
  expected_payment_date DATE,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  status TEXT DEFAULT 'DRAFT',
  file_path TEXT,
  folder_path TEXT,
  description TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invoice_number ON invoice(number);
CREATE INDEX IF NOT EXISTS idx_invoice_client_id ON invoice(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_issue_date ON invoice(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoice_due_date ON invoice(due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoice(status);
CREATE INDEX IF NOT EXISTS idx_invoice_paid_at ON invoice(paid_at);

-- Add RLS (Row Level Security) policies if needed
-- ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_invoice_updated_at 
  BEFORE UPDATE ON invoice 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to ensure amount is positive
ALTER TABLE invoice ADD CONSTRAINT check_amount_positive CHECK (amount >= 0);

-- Add constraint to ensure valid status values
ALTER TABLE invoice ADD CONSTRAINT check_status_valid 
  CHECK (status IN ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'));
