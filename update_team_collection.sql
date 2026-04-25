-- FIX AND SYNC TEAM COLLECTION AND WALLETS
-- Ensure user_wallets uses 'id' column
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_wallets' AND column_name = 'user_id') THEN
        ALTER TABLE public.user_wallets RENAME COLUMN user_id TO id;
    END IF;
END $$;

-- Fix team_collection
DROP TABLE IF EXISTS public.team_collection;
CREATE TABLE public.team_collection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid UUID REFERENCES public.profiles(id),
    node_id TEXT UNIQUE,
    package_amount NUMERIC DEFAULT 50,
    status TEXT DEFAULT 'active',
    pending_yield NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure profiles has active status columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_package NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS operator_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sponsor_id UUID;
