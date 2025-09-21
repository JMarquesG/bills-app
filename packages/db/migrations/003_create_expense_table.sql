-- Migration: Create expense table
-- Description: Creates the expense table for storing expense information
-- Date: 2024-01-01

CREATE TABLE IF NOT EXISTS expense (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoice(id) ON DELETE SET NULL,
  vendor TEXT,
  category TEXT,
  date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  file_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_expense_invoice_id ON expense(invoice_id);
CREATE INDEX IF NOT EXISTS idx_expense_vendor ON expense(vendor);
CREATE INDEX IF NOT EXISTS idx_expense_category ON expense(category);
CREATE INDEX IF NOT EXISTS idx_expense_date ON expense(date);

-- Add RLS (Row Level Security) policies if needed
-- ALTER TABLE expense ENABLE ROW LEVEL SECURITY;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_expense_updated_at 
  BEFORE UPDATE ON expense 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to ensure amount is positive
ALTER TABLE expense ADD CONSTRAINT check_expense_amount_positive CHECK (amount >= 0);
