
-- Task 2: Binary MLM Core Database Schema & Matching Engine
-- Standardizing 'members' table for enterprise MLM binary structure

-- ENUM for positions
DO $$ BEGIN
    CREATE TYPE binary_position AS ENUM ('LEFT', 'RIGHT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Table to store MLM structure separate from Auth Profiles for cleaner indexing
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    sponsor_id UUID REFERENCES auth.users(id), -- Direct Referral
    placement_id UUID REFERENCES auth.users(id), -- Immediate Parent in Tree
    position binary_position NOT NULL,
    left_pv NUMERIC(20, 2) DEFAULT 0,
    right_pv NUMERIC(20, 2) DEFAULT 0,
    carry_forward_pv NUMERIC(20, 2) DEFAULT 0,
    total_earned NUMERIC(20, 2) DEFAULT 0,
    total_investment NUMERIC(20, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT false,
    rank_level INTEGER DEFAULT 0,
    weeks_paid INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- STIRCT: prevent two users from occupying the same placement position
    CONSTRAINT unique_placement_position UNIQUE (placement_id, position)
);

-- Indexing for fast tree traversal
CREATE INDEX IF NOT EXISTS idx_members_sponsor ON members(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_members_placement ON members(placement_id);

-- RPC: Calculate Binary Commission (Matching Bonus)
CREATE OR REPLACE FUNCTION calculate_binary_commission(member_uuid UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    matching_amount NUMERIC(20, 2);
    bonus NUMERIC(20, 2);
    new_carry NUMERIC(20, 2);
    commission_rate NUMERIC := 0.10; -- 10% matching
    result_msg TEXT;
BEGIN
    -- Fetch the specific member's volumes
    SELECT * INTO rec FROM members WHERE id = member_uuid;
    
    IF NOT FOUND THEN
        RETURN json_build_object('status', 'error', 'message', 'Member not found');
    END IF;

    -- 1:1 Matching Logic
    IF rec.left_pv > 0 AND rec.right_pv > 0 THEN
        -- Matching is done on the weaker leg
        matching_amount := LEAST(rec.left_pv, rec.right_pv);
        bonus := matching_amount * commission_rate;
        
        -- Update the member record
        UPDATE members
        SET 
            left_pv = left_pv - matching_amount,
            right_pv = right_pv - matching_amount,
            total_earned = total_earned + bonus,
            carry_forward_pv = ABS(left_pv - right_pv) -- Current strategy: reset matched bits
        WHERE id = member_uuid;
        
        -- Log the transaction
        INSERT INTO transactions (user_id, amount, type, description, status)
        VALUES (member_uuid, bonus, 'MATCHING_BONUS', 
                format('Binary matching bonus of 10%% on volume %s', matching_amount), 'completed');
        
        result_msg := format('Commission of %s calculated for volume matching %s', bonus, matching_amount);
    ELSE
        result_msg := 'Insufficient volume for matching';
    END IF;

    RETURN json_build_object('status', 'success', 'message', result_msg);
END;
$$;

-- Cron Registration (Task 3)
-- This requires the pg_cron extension to be enabled in Supabase (Settings -> Database -> Extensions)
-- Run this once to schedule the weekly payout at midnight every Monday
-- Replace <PROJECT_ID> and <FUNCTION_SECRET> with your actual deployment values
/*
SELECT cron.schedule(
  'weekly-mlm-payout',
  '0 0 * * 1',
  $$
  SELECT
    net.http_post(
      url:='https://<PROJECT_ID>.supabase.co/functions/v1/weekly-payout',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
    ) as request_id;
  $$
);
*/
