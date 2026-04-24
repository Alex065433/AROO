
-- Migration: Add missing profile fields for MLM registration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS withdrawal_password TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS two_fa_pin TEXT;
