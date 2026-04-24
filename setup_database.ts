
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sql = `
-- 1. Tables for Multi-Node Architecture
CREATE TABLE IF NOT EXISTS public.team_collection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID REFERENCES public.profiles(id),
    virtual_node_id TEXT UNIQUE,
    package_amount NUMERIC DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure members table is clean for binary tree only
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'placement_id') THEN
        ALTER TABLE public.members ADD COLUMN placement_id UUID REFERENCES public.profiles(id);
    END IF;
END $$;

-- 2. Internal Matching Logic for Mini-Tree
-- This is handled by Edge Function, but we ensure ledger is ready
CREATE TABLE IF NOT EXISTS public.income_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    from_node_id TEXT,
    amount NUMERIC NOT NULL,
    type TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Optimized Wallet Structure
CREATE TABLE IF NOT EXISTS public.user_wallets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    master_vault NUMERIC DEFAULT 0,
    referral_box NUMERIC DEFAULT 0,
    matching_box NUMERIC DEFAULT 0,
    network_yield_box NUMERIC DEFAULT 0,
    rank_bonus_box NUMERIC DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure profiles has required columns for multi-account support
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS real_email TEXT;

-- Optimized Wallet Structure
CREATE TABLE IF NOT EXISTS public.user_wallets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    master_vault NUMERIC DEFAULT 0,
    referral_box NUMERIC DEFAULT 0,
    matching_box NUMERIC DEFAULT 0,
    network_yield_box NUMERIC DEFAULT 0,
    rank_bonus_box NUMERIC DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;

async function setup() {
    console.log('Finalizing Database Schema for Separated Trees...');
    const { data, error } = await supabase.rpc('admin_execute_sql_rpc', { p_sql: sql });
    if (error) {
        console.error('Error in schema setup:', error.message);
    } else {
        console.log('Schema synchronized successfully.');
    }
}

setup();
