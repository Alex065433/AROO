
-- Migration: Add network_yield_box to voxmeta_wallets
ALTER TABLE voxmeta_wallets ADD COLUMN IF NOT EXISTS network_yield_box NUMERIC(20, 2) DEFAULT 0;

-- Ensure income_ledger has status column
ALTER TABLE income_ledger ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
