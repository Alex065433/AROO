-- Ultimate Wallet and Income Logic Fix
-- This script ensures all income types are correctly handled and prevents NULL issues

-- 1. Ensure total_income is not NULL for any profile
UPDATE public.profiles SET total_income = 0 WHERE total_income IS NULL;

-- 2. Ensure wallets JSONB structure is complete for all users
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

-- 3. Robust Wallet Update Trigger Function
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

        -- Determine which wallet to update based on payment type
        wallet_key := CASE 
            WHEN NEW.type IN ('referral_bonus', 'referral_income') THEN 'referral'
            WHEN NEW.type IN ('matching_bonus', 'matching_income') THEN 'matching'
            WHEN NEW.type IN ('rank_reward', 'rank_bonus') THEN 'rankBonus'
            WHEN NEW.type IN ('incentive_accrual', 'weekly_incentive', 'incentive_income') THEN 'incentive'
            WHEN NEW.type IN ('team_collection', 'reward_income', 'node_income') THEN 'rewards'
            WHEN NEW.type = 'deposit' THEN 'master'
            WHEN NEW.type = 'withdrawal' THEN 'master'
            WHEN NEW.type = 'package_activation' THEN 'master'
            ELSE 'master'
        END;

        -- Ensure the specific wallet exists in the JSONB
        IF NOT (current_wallets ? wallet_key) THEN
            current_wallets := jsonb_set(current_wallets, ARRAY[wallet_key], '{"balance": 0, "currency": "USDT"}'::jsonb);
        END IF;

        -- Update the specific wallet and the master wallet (except for deposits/withdrawals which are already master)
        IF wallet_key != 'master' THEN
            -- Add to specific wallet and master wallet
            UPDATE public.profiles
            SET wallets = jsonb_set(
                    jsonb_set(current_wallets, ARRAY[wallet_key, 'balance'], ((COALESCE(current_wallets->wallet_key->>'balance', '0'))::numeric + NEW.amount)::text::jsonb),
                    ARRAY['master', 'balance'], ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + NEW.amount)::text::jsonb
                ),
                total_income = COALESCE(total_income, 0) + CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END
            WHERE id = user_id;

            -- Log to transactions table for history
            INSERT INTO public.transactions (uid, amount, type, description)
            VALUES (user_id, NEW.amount, wallet_key, COALESCE(NEW.order_description, 'Income: ' || wallet_key) || ' (' || NEW.type || ')');
        ELSE
            -- Handle master wallet updates (deposits, withdrawals, package activations)
            new_balance := CASE 
                WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric - NEW.amount)
                WHEN NEW.type = 'deposit' THEN
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + NEW.amount)
                ELSE 
                    (COALESCE(current_wallets->'master'->>'balance', '0'))::numeric
            END;

            UPDATE public.profiles
            SET wallets = jsonb_set(current_wallets, ARRAY['master', 'balance'], new_balance::text::jsonb)
            WHERE id = user_id;
            
            -- Log deposit to transactions if it's a deposit
            IF NEW.type = 'deposit' THEN
                INSERT INTO public.transactions (uid, amount, type, description)
                VALUES (user_id, NEW.amount, 'master', 'Deposit: ' || COALESCE(NEW.order_description, 'Admin Add Funds'));
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Ensure trigger is correctly attached
DROP TRIGGER IF EXISTS on_payment_update_wallets ON public.payments;
CREATE TRIGGER on_payment_update_wallets
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_wallets_on_payment();

-- 5. Fix process_package_activation to be more reliable
CREATE OR REPLACE FUNCTION public.process_package_activation()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
    v_package_amount NUMERIC;
    v_sponsor_id UUID;
    v_referral_bonus NUMERIC;
BEGIN
    -- Only process if payment is finished and type is package_activation
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND NEW.type = 'package_activation' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        v_package_amount := NEW.amount;

        -- 1. Update the user's own package info and status
        UPDATE public.profiles
        SET active_package = v_package_amount,
            package_amount = v_package_amount,
            status = 'active'
        WHERE id = NEW.uid::uuid;

        -- 1.1 Generate Team Collection Nodes (Aligned with constants.tsx)
        INSERT INTO public.team_collection (uid, node_id, name, balance, eligible, created_at)
        SELECT 
            NEW.uid::uuid,
            'NODE-' || substring(gen_random_uuid()::text from 1 for 8) || '-' || i,
            'Node ' || i || ' (Package ' || v_package_amount || ')',
            0,
            true,
            NOW()
        FROM generate_series(1, CASE 
            WHEN v_package_amount >= 12750 THEN 255
            WHEN v_package_amount >= 6350 THEN 127
            WHEN v_package_amount >= 3150 THEN 63
            WHEN v_package_amount >= 1550 THEN 31
            WHEN v_package_amount >= 750 THEN 15
            WHEN v_package_amount >= 350 THEN 7
            WHEN v_package_amount >= 150 THEN 3
            ELSE 1
        END) AS i
        ON CONFLICT (node_id) DO NOTHING;

        -- 1.2 Incentive Pool Accrual (1% to the user themselves)
        INSERT INTO public.payments (uid, amount, type, status, order_description)
        VALUES (NEW.uid::uuid, v_package_amount * 0.01, 'incentive_accrual', 'finished', 'INCENTIVE POOL ACCRUAL for Package ' || v_package_amount);

        -- Trigger rank check for the user themselves
        PERFORM public.check_and_update_rank(NEW.uid::uuid);

        -- 2. Referral Bonus (5% to direct sponsor)
        SELECT p.sponsor_id INTO v_sponsor_id FROM public.profiles p WHERE p.id = NEW.uid::uuid;
        
        IF v_sponsor_id IS NOT NULL THEN
            v_referral_bonus := v_package_amount * 0.05;
            
            INSERT INTO public.payments (uid, amount, type, status, order_description)
            VALUES (v_sponsor_id, v_referral_bonus, 'referral_bonus', 'finished', 'DIRECT REFERRAL YIELD from ' || NEW.uid::text);
            
            -- Trigger rank check for sponsor
            PERFORM public.check_and_update_rank(v_sponsor_id);
        END IF;

        -- 3. Traverse up to update ancestors' volume
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = NEW.uid::uuid;

        WHILE current_parent_id IS NOT NULL LOOP
            -- Update the parent's matching volume AND cumulative volume (in units of $50)
            UPDATE public.profiles
            SET matching_volume = jsonb_set(
                    COALESCE(matching_volume, '{"left": 0, "right": 0}'::jsonb), 
                    ARRAY[lower(current_side)], 
                    ((COALESCE(matching_volume->>lower(current_side), '0'))::numeric + (v_package_amount / 50))::text::jsonb
                ),
                cumulative_volume = jsonb_set(
                    COALESCE(cumulative_volume, '{"left": 0, "right": 0}'::jsonb), 
                    ARRAY[lower(current_side)], 
                    ((COALESCE(cumulative_volume->>lower(current_side), '0'))::numeric + (v_package_amount / 50))::text::jsonb
                )
            WHERE id = current_parent_id::uuid;

            -- Trigger binary matching check for this parent
            PERFORM public.calculate_binary_matching(current_parent_id::uuid);
            
            -- Trigger rank check for this parent
            PERFORM public.check_and_update_rank(current_parent_id::uuid);

            -- Move up to the next parent
            SELECT parent_id, side INTO current_parent_id, current_side
            FROM public.profiles
            WHERE id = current_parent_id::uuid;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_payment_update_process_package ON public.payments;
CREATE TRIGGER on_payment_update_process_package
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.process_package_activation();

-- 6. RPC to fix all system wallets at once
CREATE OR REPLACE FUNCTION public.fix_system_wallets()
RETURNS void AS $$
BEGIN
    -- Ensure total_income is not NULL
    UPDATE public.profiles SET total_income = 0 WHERE total_income IS NULL;

    -- Ensure wallets JSONB structure is complete
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
