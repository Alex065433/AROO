-- COMPREHENSIVE WALLET AND INCOME REFLECTION FIX
-- This script ensures all income types are correctly reflected in user wallets and prevents double-counting.

-- 1. Ensure wallets JSONB structure is complete for all users
UPDATE public.profiles
SET wallets = jsonb_set(
    jsonb_set(
        jsonb_set(
            jsonb_set(
                jsonb_set(
                    jsonb_set(COALESCE(wallets, '{}'::jsonb), '{master}', COALESCE(wallets->'master', '{"balance": 0, "currency": "USDT"}'::jsonb)),
                    '{referral}', COALESCE(wallets->'referral', '{"balance": 0, "currency": "USDT"}'::jsonb)
                ),
                '{matching}', COALESCE(wallets->'matching', '{"balance": 0, "currency": "USDT"}'::jsonb)
            ),
            '{rankBonus}', COALESCE(wallets->'rankBonus', '{"balance": 0, "currency": "USDT"}'::jsonb)
        ),
        '{incentive}', COALESCE(wallets->'incentive', '{"balance": 0, "currency": "USDT"}'::jsonb)
    ),
    '{rewards}', COALESCE(wallets->'rewards', '{"balance": 0, "currency": "USDT"}'::jsonb)
)
WHERE wallets IS NULL OR NOT (wallets ? 'incentive') OR NOT (wallets ? 'rewards');

-- 2. Robust Wallet Update Trigger Function
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    current_wallets JSONB;
    wallet_key TEXT;
    new_balance NUMERIC;
    user_id UUID;
BEGIN
    -- Only process if status is finished or completed
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        user_id := NEW.uid::uuid;
        
        -- Get current wallets with lock to prevent race conditions
        SELECT wallets INTO current_wallets FROM public.profiles WHERE id = user_id FOR UPDATE;
        
        -- Ensure wallets is not null and has all keys
        current_wallets := COALESCE(current_wallets, '{
            "master": {"balance": 0, "currency": "USDT"},
            "referral": {"balance": 0, "currency": "USDT"},
            "matching": {"balance": 0, "currency": "USDT"},
            "rankBonus": {"balance": 0, "currency": "USDT"},
            "incentive": {"balance": 0, "currency": "USDT"},
            "rewards": {"balance": 0, "currency": "USDT"}
        }'::jsonb);

        -- Determine which sub-wallet to update based on payment type
        wallet_key := CASE 
            WHEN NEW.type IN ('referral_bonus', 'referral_income') THEN 'referral'
            WHEN NEW.type IN ('matching_bonus', 'matching_income', 'binary_matching', 'binary_income') THEN 'matching'
            WHEN NEW.type IN ('rank_reward', 'rank_bonus') THEN 'rankBonus'
            WHEN NEW.type IN ('incentive_accrual', 'weekly_incentive', 'incentive_income') THEN 'incentive'
            WHEN NEW.type IN ('team_collection', 'reward_income', 'node_income') THEN 'rewards'
            WHEN NEW.type = 'deposit' THEN 'master'
            WHEN NEW.type = 'withdrawal' THEN 'master'
            WHEN NEW.type = 'package_activation' THEN 'master'
            WHEN NEW.type = 'claim' THEN 'master'
            ELSE 'master'
        END;

        -- Ensure the specific wallet exists in the JSONB
        IF NOT (current_wallets ? wallet_key) THEN
            current_wallets := jsonb_set(current_wallets, ARRAY[wallet_key], '{"balance": 0, "currency": "USDT"}'::jsonb);
        END IF;

        -- Update Logic
        IF wallet_key != 'master' THEN
            -- INCOME: Add to specific sub-wallet and total_income
            -- Note: We do NOT add to master here because users must "Claim" it to master.
            UPDATE public.profiles
            SET wallets = jsonb_set(
                    current_wallets, 
                    ARRAY[wallet_key, 'balance'], 
                    ((COALESCE(current_wallets->wallet_key->>'balance', '0'))::numeric + NEW.amount)::text::jsonb
                ),
                total_income = COALESCE(total_income, 0) + CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END
            WHERE id = user_id;

            -- Log to transactions table for history
            INSERT INTO public.transactions (uid, amount, type, description)
            VALUES (user_id, NEW.amount, wallet_key, COALESCE(NEW.order_description, 'Income: ' || wallet_key) || ' (' || NEW.type || ')');
        ELSE
            -- MASTER WALLET UPDATES (Deposits, Withdrawals, Package Activations, Claims)
            new_balance := CASE 
                WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric - NEW.amount)
                WHEN NEW.type = 'deposit' OR NEW.type = 'claim' THEN
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + NEW.amount)
                ELSE 
                    (COALESCE(current_wallets->'master'->>'balance', '0'))::numeric
            END;

            UPDATE public.profiles
            SET wallets = jsonb_set(current_wallets, ARRAY['master', 'balance'], new_balance::text::jsonb)
            WHERE id = user_id;
            
            -- Log to transactions if it's a significant master wallet event
            IF NEW.type IN ('deposit', 'withdrawal', 'claim') THEN
                INSERT INTO public.transactions (uid, amount, type, description)
                VALUES (user_id, NEW.amount, 'master', COALESCE(NEW.order_description, NEW.type || ' transaction'));
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-attach the trigger
DROP TRIGGER IF EXISTS on_payment_update_wallets ON public.payments;
CREATE TRIGGER on_payment_update_wallets
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_wallets_on_payment();

-- 4. Fix update_user_wallet to be more flexible (handles 3 or 5 args via overloading or default values)
CREATE OR REPLACE FUNCTION public.update_user_wallet(
    user_id UUID, 
    amount NUMERIC, 
    p_type TEXT, 
    p_description TEXT DEFAULT 'System Update'
)
RETURNS VOID AS $$
BEGIN
    -- Just log the payment - the trigger handles the rest
    INSERT INTO public.payments (uid, amount, type, status, order_description)
    VALUES (user_id, amount, p_type, 'finished', p_description);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Overloaded version for 5-argument calls (backward compatibility)
CREATE OR REPLACE FUNCTION public.update_user_wallet(
    user_id UUID, 
    wallet_key TEXT, 
    amount NUMERIC, 
    p_type TEXT, 
    p_description TEXT
)
RETURNS VOID AS $$
BEGIN
    -- Just log the payment - the trigger handles the rest
    INSERT INTO public.payments (uid, amount, type, status, order_description)
    VALUES (user_id, amount, p_type, 'finished', p_description);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Helper to Rebuild Wallets from Payments (Sync function)
CREATE OR REPLACE FUNCTION public.rebuild_wallets_from_payments()
RETURNS VOID AS $$
DECLARE
    p RECORD;
BEGIN
    -- Reset all wallets to zero
    UPDATE public.profiles
    SET total_income = 0,
        wallets = '{
            "master": {"balance": 0, "currency": "USDT"},
            "referral": {"balance": 0, "currency": "USDT"},
            "matching": {"balance": 0, "currency": "USDT"},
            "rankBonus": {"balance": 0, "currency": "USDT"},
            "incentive": {"balance": 0, "currency": "USDT"},
            "rewards": {"balance": 0, "currency": "USDT"}
        }'::jsonb;

    -- Re-process every finished payment in order
    -- This will trigger update_wallets_on_payment for each record
    -- To avoid trigger overhead during rebuild, we could do it manually, 
    -- but for safety we'll just let the trigger run or use a manual loop.
    
    -- Manual loop for accuracy:
    FOR p IN SELECT * FROM public.payments WHERE status IN ('finished', 'completed') ORDER BY created_at ASC LOOP
        -- We can't easily "trigger" it manually without updating the record, 
        -- so we'll just implement the logic here or update the record to itself.
        UPDATE public.payments SET status = status WHERE id = p.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update claim_wallet to NOT manually update wallets (let the trigger do it)
CREATE OR REPLACE FUNCTION public.claim_wallet(p_user_id UUID, p_wallet_key TEXT)
RETURNS VOID AS $$
DECLARE
    v_balance NUMERIC;
BEGIN
    -- Get current balance of the specific wallet
    SELECT (wallets->p_wallet_key->>'balance')::numeric INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_balance > 0 THEN
        -- 1. Deduct from specific wallet manually (since 'claim' type in trigger only adds to master)
        UPDATE public.profiles
        SET wallets = jsonb_set(
            wallets,
            ARRAY[p_wallet_key, 'balance'],
            '0'::jsonb
        )
        WHERE id = p_user_id;

        -- 2. Log 'claim' payment - the trigger will add this amount to the 'master' wallet
        INSERT INTO public.payments (uid, amount, type, status, order_description, created_at)
        VALUES (p_user_id, v_balance, 'claim', 'finished', 'Claimed ' || p_wallet_key || ' to Master Vault', NOW());
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Corrected calculate_binary_matching (No double-counting)
CREATE OR REPLACE FUNCTION public.calculate_binary_matching(user_id UUID)
RETURNS VOID AS $$
DECLARE
    u_left_vol NUMERIC;
    u_right_vol NUMERIC;
    match_amount NUMERIC;
    dollars_per_unit NUMERIC;
    bonus_amount NUMERIC;
    current_rank INTEGER;
    daily_cap NUMERIC;
    today_income NUMERIC;
    today_date TEXT := TO_CHAR(NOW(), 'YYYY-MM-DD');
    u_active_pkg NUMERIC;
    u_matched_pairs INTEGER;
BEGIN
    -- Get current volumes, wallets, and rank for capping
    SELECT 
        (COALESCE(matching_volume->>'left', '0'))::numeric, 
        (COALESCE(matching_volume->>'right', '0'))::numeric, 
        rank, 
        (COALESCE(daily_income->>'amount', '0'))::numeric, 
        COALESCE(daily_income->>'date', TO_CHAR(NOW(), 'YYYY-MM-DD')),
        active_package,
        COALESCE(matched_pairs, 0)
    INTO u_left_vol, u_right_vol, current_rank, today_income, today_date, u_active_pkg, u_matched_pairs
    FROM public.profiles
    WHERE id = user_id::uuid;

    -- Binary matching only activates if package is $50 or more
    IF u_active_pkg IS NULL OR u_active_pkg < 50 THEN
        RETURN;
    END IF;

    -- Calculate matching amount (in units of $50)
    match_amount := LEAST(u_left_vol, u_right_vol);

    IF match_amount >= 1 THEN
        -- 2:1 or 1:2 logic for the VERY FIRST pair
        IF u_matched_pairs = 0 THEN
            IF (u_left_vol >= 2 AND u_right_vol >= 1) OR (u_left_vol >= 1 AND u_right_vol >= 2) THEN
                match_amount := 1;
            ELSE
                RETURN;
            END IF;
        END IF;

        -- Determine pair income and daily cap based on rank
        CASE 
            WHEN current_rank = 1 THEN dollars_per_unit := 5.0; daily_cap := 250;
            WHEN current_rank = 2 THEN dollars_per_unit := 5.0; daily_cap := 500;
            WHEN current_rank = 3 THEN dollars_per_unit := 5.0; daily_cap := 1000;
            WHEN current_rank = 4 THEN dollars_per_unit := 5.0; daily_cap := 1500;
            WHEN current_rank = 5 THEN dollars_per_unit := 5.0; daily_cap := 2000;
            WHEN current_rank = 6 THEN dollars_per_unit := 5.0; daily_cap := 2500;
            WHEN current_rank = 7 THEN dollars_per_unit := 5.0; daily_cap := 3000;
            WHEN current_rank = 8 THEN dollars_per_unit := 5.0; daily_cap := 4000;
            WHEN current_rank = 9 THEN dollars_per_unit := 5.0; daily_cap := 5000;
            ELSE dollars_per_unit := 5.0; daily_cap := 250;
        END CASE;

        bonus_amount := match_amount * dollars_per_unit;

        -- Check daily cap
        IF today_date = TO_CHAR(NOW(), 'YYYY-MM-DD') THEN
            IF today_income + bonus_amount > daily_cap THEN
                bonus_amount := GREATEST(0, daily_cap - today_income);
            END IF;
        ELSE
            today_income := 0;
            IF bonus_amount > daily_cap THEN
                bonus_amount := daily_cap;
            END IF;
        END IF;

        IF bonus_amount > 0 THEN
            -- Update matching volumes (subtract matched units)
            UPDATE public.profiles
            SET matching_volume = jsonb_set(
                    jsonb_set(matching_volume, '{left}', ((u_left_vol - match_amount)::text)::jsonb),
                    '{right}', ((u_right_vol - match_amount)::text)::jsonb
                ),
                matched_pairs = COALESCE(matched_pairs, 0) + match_amount,
                daily_income = jsonb_build_object('amount', today_income + bonus_amount, 'date', TO_CHAR(NOW(), 'YYYY-MM-DD'))
            WHERE id = user_id::uuid;

            -- Record the income payment - THE TRIGGER WILL UPDATE THE WALLET
            INSERT INTO public.payments (uid, amount, type, status, method, order_description)
            VALUES (user_id::uuid, bonus_amount, 'binary_matching', 'finished', 'internal', 'Binary matching bonus for ' || match_amount || ' pairs');
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Corrected check_and_update_rank (Awards rewards)
CREATE OR REPLACE FUNCTION public.check_and_update_rank(user_id UUID)
RETURNS VOID AS $$
DECLARE
    u_rank INTEGER;
    u_left_vol NUMERIC;
    u_right_vol NUMERIC;
    u_active_pkg NUMERIC;
    new_rank INTEGER;
    reward_amount NUMERIC := 0;
BEGIN
    SELECT rank, (COALESCE(cumulative_volume->>'left', '0'))::numeric, (COALESCE(cumulative_volume->>'right', '0'))::numeric, active_package
    INTO u_rank, u_left_vol, u_right_vol, u_active_pkg
    FROM public.profiles
    WHERE id = user_id::uuid;

    -- CRITICAL: Rank only activates if package is $50 or more
    IF u_active_pkg IS NULL OR u_active_pkg < 50 THEN
        IF u_rank > 0 THEN
            UPDATE public.profiles 
            SET rank = 0, 
                rank_name = 'Inactive',
                status = 'inactive'
            WHERE id = user_id::uuid;
        END IF;
        RETURN;
    END IF;

    new_rank := u_rank;

    -- Rank Criteria (matching Page 10)
    IF u_left_vol >= 70000 AND u_right_vol >= 70000 AND u_rank < 12 THEN new_rank := 12; reward_amount := 5000;
    ELSIF u_left_vol >= 30000 AND u_right_vol >= 30000 AND u_rank < 11 THEN new_rank := 11; reward_amount := 2500;
    ELSIF u_left_vol >= 15000 AND u_right_vol >= 15000 AND u_rank < 10 THEN new_rank := 10; reward_amount := 1000;
    ELSIF u_left_vol >= 7000 AND u_right_vol >= 7000 AND u_rank < 9 THEN new_rank := 9; reward_amount := 500;
    ELSIF u_left_vol >= 3000 AND u_right_vol >= 3000 AND u_rank < 8 THEN new_rank := 8; reward_amount := 250;
    ELSIF u_left_vol >= 1500 AND u_right_vol >= 1500 AND u_rank < 7 THEN new_rank := 7; reward_amount := 150;
    ELSIF u_left_vol >= 700 AND u_right_vol >= 700 AND u_rank < 6 THEN new_rank := 6; reward_amount := 100;
    ELSIF u_left_vol >= 300 AND u_right_vol >= 300 AND u_rank < 5 THEN new_rank := 5; reward_amount := 50;
    ELSIF u_left_vol >= 150 AND u_right_vol >= 150 AND u_rank < 4 THEN new_rank := 4; reward_amount := 25;
    ELSIF u_left_vol >= 70 AND u_right_vol >= 70 AND u_rank < 3 THEN new_rank := 3; reward_amount := 15;
    ELSIF u_left_vol >= 30 AND u_right_vol >= 30 AND u_rank < 2 THEN new_rank := 2; reward_amount := 10;
    ELSIF u_rank = 0 AND u_active_pkg >= 50 THEN new_rank := 1; reward_amount := 0;
    END IF;

    IF new_rank > u_rank THEN
        UPDATE public.profiles
        SET rank = new_rank,
            rank_name = CASE 
                WHEN new_rank = 1 THEN 'Starter'
                WHEN new_rank = 2 THEN 'Bronze'
                WHEN new_rank = 3 THEN 'Silver'
                WHEN new_rank = 4 THEN 'Gold'
                WHEN new_rank = 5 THEN 'Platina'
                WHEN new_rank = 6 THEN 'Diamond'
                WHEN new_rank = 7 THEN 'Blue Sapphire'
                WHEN new_rank = 8 THEN 'Ruby Elite'
                WHEN new_rank = 9 THEN 'Emerald Crown'
                WHEN new_rank = 10 THEN 'Titanium King'
                WHEN new_rank = 11 THEN 'Royal Legend'
                WHEN new_rank = 12 THEN 'Global Ambassador'
                ELSE rank_name
            END
        WHERE id = user_id::uuid;

        -- Award reward if applicable
        IF reward_amount > 0 THEN
            INSERT INTO public.payments (uid, amount, type, status, method, order_description)
            VALUES (user_id::uuid, reward_amount, 'rank_reward', 'finished', 'internal', 'Rank Reward for reaching ' || new_rank);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
