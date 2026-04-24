-- Migration: ROI Lifecycle Implementation
-- Re-defining daily_roi_tracking for the 200-day logic

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'daily_roi_tracking') THEN
        CREATE TABLE daily_roi_tracking (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            node_id TEXT NOT NULL, -- Operator ID (ARW-XXXX) or user UUID
            activation_amount NUMERIC(20, 2) DEFAULT 50,
            total_days_paid INTEGER DEFAULT 0,
            max_days INTEGER DEFAULT 200,
            status VARCHAR DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT status_check CHECK (status IN ('ACTIVE', 'STOPPED', 'COMPLETED'))
        );
    ELSE
        -- Ensure all required columns exist for existing table
        ALTER TABLE daily_roi_tracking ADD COLUMN IF NOT EXISTS total_days_paid INTEGER DEFAULT 0;
        ALTER TABLE daily_roi_tracking ADD COLUMN IF NOT EXISTS max_days INTEGER DEFAULT 200;
        ALTER TABLE daily_roi_tracking ADD COLUMN IF NOT EXISTS node_id TEXT;
        
        -- Backfill node_id if missing (using user_id as fallback)
        UPDATE daily_roi_tracking SET node_id = user_id::text WHERE node_id IS NULL;
        ALTER TABLE daily_roi_tracking ALTER COLUMN node_id SET NOT NULL;

        -- DATA NORMALIZATION: Fix existing status values to match new uppercase constraint
        UPDATE daily_roi_tracking SET status = 'ACTIVE' WHERE status ILIKE 'active' OR status IS NULL;
        UPDATE daily_roi_tracking SET status = 'STOPPED' WHERE status ILIKE 'stopped';
        UPDATE daily_roi_tracking SET status = 'COMPLETED' WHERE status ILIKE 'completed';

        -- Fix status column defaults and constraint
        ALTER TABLE daily_roi_tracking ALTER COLUMN status SET DEFAULT 'ACTIVE';
        
        -- Drop old constraint if exists and add the new one
        ALTER TABLE daily_roi_tracking DROP CONSTRAINT IF EXISTS status_check;
        ALTER TABLE daily_roi_tracking ADD CONSTRAINT status_check CHECK (status IN ('ACTIVE', 'STOPPED', 'COMPLETED'));
    END IF;
END $$;

-- Also ensure user_wallets has the network_yield_box
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS network_yield_box NUMERIC(20, 2) DEFAULT 0;
