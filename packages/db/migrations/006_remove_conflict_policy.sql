-- Migration: Remove conflict policy column
-- Description: Removes the supabase_conflict_policy column as local changes now always take precedence
-- Date: 2024-09-21

-- Remove the conflict policy column from setting table
ALTER TABLE setting DROP COLUMN IF EXISTS supabase_conflict_policy;

-- Add comment to document the change
COMMENT ON TABLE setting IS 'Application settings - local changes always take precedence over cloud';
