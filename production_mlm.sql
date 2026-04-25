-- FINAL PRODUCTION MLM SCHEMA & LOGIC
-- 1. Tables Setup
CREATE TABLE IF NOT EXISTS public.members (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    sponsor_id UUID REFERENCES public.profiles(id),
    placement_id UUID REFERENCES public.profiles(id),
    position TEXT CHECK (position IN ('LEFT', 'RIGHT')),
    left_points NUMERIC DEFAULT 0,
    right_points NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    is_virtual BOOLEAN DEFAULT FALSE,
    master_id UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.income_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    node_id UUID,
    operator_id TEXT,
    amount NUMERIC NOT NULL,
    type TEXT CHECK (type IN ('DIRECT_REFERRAL', 'BINARY_MATCHING', 'DAILY_ROI', 'RANK_BONUS', 'REWARD')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_roi_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    node_id UUID,
    operator_id TEXT,
    daily_amount NUMERIC,
    total_paid NUMERIC DEFAULT 0,
    days_paid INTEGER DEFAULT 0,
    max_days INTEGER DEFAULT 200,
    status TEXT DEFAULT 'ACTIVE',
    last_payout TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_wallets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    master_vault NUMERIC DEFAULT 0,
    referral_box NUMERIC DEFAULT 0,
    network_yield_box NUMERIC DEFAULT 0,
    rank_bonus_box NUMERIC DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Binary Traversal Function
CREATE OR REPLACE FUNCTION public.process_binary_matching(p_node_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
DECLARE
    v_current_id UUID;
    v_parent_id UUID;
    v_side TEXT;
    v_left_pts NUMERIC;
    v_right_pts NUMERIC;
    v_pairs INTEGER;
    v_matching_inc NUMERIC;
    v_operator_id TEXT;
BEGIN
    v_current_id := p_node_id;
    
    WHILE v_current_id IS NOT NULL LOOP
        SELECT placement_id, position INTO v_parent_id, v_side FROM public.members WHERE id = v_current_id;
        
        EXIT WHEN v_parent_id IS NULL;
        
        SELECT left_points, right_points INTO v_left_pts, v_right_pts FROM public.members WHERE id = v_parent_id;
        SELECT operator_id INTO v_operator_id FROM public.profiles WHERE id = v_parent_id;
        
        IF v_side = 'LEFT' THEN
            v_left_pts := v_left_pts + p_amount;
        ELSE
            v_right_pts := v_right_pts + p_amount;
        END IF;
        
        v_pairs := floor(least(v_left_pts, v_right_pts) / 50);
        
        IF v_pairs > 0 THEN
            v_matching_inc := v_pairs * 5; -- 10% matching
            
            -- Log Matching Income
            INSERT INTO public.income_ledger (user_id, node_id, operator_id, amount, type, description)
            VALUES (v_parent_id, p_node_id, v_operator_id, v_matching_inc, 'BINARY_MATCHING', 'Binary Matching Bonus');
            
            -- Stop ROI per rules
            UPDATE public.daily_roi_tracking SET status = 'STOPPED' WHERE node_id = v_parent_id;
            
            -- Update points
            v_left_pts := v_left_pts - (v_pairs * 50);
            v_right_pts := v_right_pts - (v_pairs * 50);
            
            -- Update Master Vault
            UPDATE public.user_wallets SET master_vault = master_vault + v_matching_inc WHERE user_id = v_parent_id;
        END IF;
        
        UPDATE public.members 
        SET left_points = v_left_pts, 
            right_points = v_right_pts 
        WHERE id = v_parent_id;
        
        -- Move up
        v_current_id := v_parent_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.1 Yield Claiming Function
CREATE OR REPLACE FUNCTION public.claim_all_yield(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_amount NUMERIC;
BEGIN
    SELECT (referral_box + network_yield_box + rank_bonus_box) INTO v_amount 
    FROM public.user_wallets WHERE user_id = p_user_id;
    
    IF v_amount > 0 THEN
        UPDATE public.user_wallets 
        SET master_vault = master_vault + v_amount,
            referral_box = 0,
            network_yield_box = 0,
            rank_bonus_box = 0,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;
    
    RETURN COALESCE(v_amount, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Daily ROI Payout Function
CREATE OR REPLACE FUNCTION public.payout_daily_roi()
RETURNS VOID AS $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN SELECT * FROM public.daily_roi_tracking WHERE status = 'ACTIVE' AND days_paid < max_days LOOP
        -- Log to ledger
        INSERT INTO public.income_ledger (user_id, node_id, operator_id, amount, type, description)
        VALUES (v_rec.user_id, v_rec.node_id, v_rec.operator_id, v_rec.daily_amount, 'DAILY_ROI', 'Daily ROI Payout');

        -- Update wallets
        UPDATE public.user_wallets 
        SET network_yield_box = network_yield_box + v_rec.daily_amount 
        WHERE user_id = v_rec.user_id;

        -- Update tracking
        UPDATE public.daily_roi_tracking
        SET total_paid = total_paid + v_rec.daily_amount,
            days_paid = days_paid + 1,
            last_payout = NOW()
        WHERE id = v_rec.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
