-- 1. Database Fix: Add missing columns to profiles table safely
DO $$ 
BEGIN 
    -- Add total_income
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='profiles' AND column_name='total_income') THEN
        ALTER TABLE public.profiles ADD COLUMN total_income NUMERIC DEFAULT 0;
    END IF;

    -- Add wallet_balance
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='profiles' AND column_name='wallet_balance') THEN
        ALTER TABLE public.profiles ADD COLUMN wallet_balance NUMERIC DEFAULT 0;
    END IF;

    -- Add referral_income
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='profiles' AND column_name='referral_income') THEN
        ALTER TABLE public.profiles ADD COLUMN referral_income NUMERIC DEFAULT 0;
    END IF;

    -- Add matching_income
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='profiles' AND column_name='matching_income') THEN
        ALTER TABLE public.profiles ADD COLUMN matching_income NUMERIC DEFAULT 0;
    END IF;
END $$;

-- 2. Update the wallet update trigger to also update the new flat columns
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_amount NUMERIC;
BEGIN
    -- Only process if status is finished or completed
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        
        v_amount := NEW.amount;

        -- Update flat columns based on payment type
        IF NEW.type IN ('referral_bonus', 'referral_income') THEN
            UPDATE public.profiles 
            SET referral_income = COALESCE(referral_income, 0) + v_amount,
                total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type IN ('matching_bonus', 'matching_income', 'binary_matching', 'binary_income') THEN
            UPDATE public.profiles 
            SET matching_income = COALESCE(matching_income, 0) + v_amount,
                total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type = 'deposit' THEN
            UPDATE public.profiles 
            SET wallet_balance = COALESCE(wallet_balance, 0) + v_amount
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type = 'withdrawal' THEN
            UPDATE public.profiles 
            SET wallet_balance = COALESCE(wallet_balance, 0) - v_amount
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type = 'package_activation' THEN
            IF NEW.method = 'WALLET' THEN
                UPDATE public.profiles 
                SET wallet_balance = COALESCE(wallet_balance, 0) - v_amount
                WHERE id = NEW.uid::uuid;
            END IF;
        ELSE
            -- Default for other income types (rank_bonus, incentive_accrual, etc.)
            UPDATE public.profiles 
            SET total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount
            WHERE id = NEW.uid::uuid;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Sync existing data (Optional but recommended)
UPDATE public.profiles p
SET 
  total_income = (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE uid = p.id AND type IN ('referral_bonus', 'referral_income', 'matching_bonus', 'matching_income', 'binary_matching', 'binary_income', 'rank_reward', 'rank_bonus', 'incentive_accrual', 'weekly_incentive', 'incentive_income', 'team_collection', 'reward_income', 'node_income') AND (status = 'finished' OR status = 'completed')),
  wallet_balance = (COALESCE(wallets->'master'->>'balance', '0'))::numeric,
  referral_income = (COALESCE(wallets->'referral'->>'balance', '0'))::numeric,
  matching_income = (COALESCE(wallets->'matching'->>'balance', '0'))::numeric;
