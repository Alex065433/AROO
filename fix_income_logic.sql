-- Fix Income Logic and Schema Issues
-- 1. Add cumulative_volume to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cumulative_volume JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb;

-- 2. Ensure all users have the correct wallet structure (including incentive)
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
WHERE wallets IS NULL OR NOT (wallets ? 'incentive');

-- 3. Fix process_package_activation to use cumulative_volume and more unique node_id
CREATE OR REPLACE FUNCTION public.process_package_activation()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
    package_amount NUMERIC;
    sponsor_id UUID;
    referral_bonus NUMERIC;
BEGIN
    -- Only process if payment is finished and type is package_activation
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND NEW.type = 'package_activation' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        package_amount := NEW.amount;

        -- 1. Update the user's own package info and status
        UPDATE public.profiles
        SET active_package = package_amount,
            package_amount = package_amount,
            status = 'active'
        WHERE id = NEW.uid::uuid;

        -- 1.1 Generate Team Collection Nodes (Page 13)
        INSERT INTO public.team_collection (uid, node_id, name, balance, eligible, created_at)
        SELECT 
            NEW.uid::uuid,
            'NODE-' || substring(gen_random_uuid()::text from 1 for 8) || '-' || i,
            'Node ' || i || ' (Package ' || package_amount || ')',
            0,
            true,
            NOW()
        FROM generate_series(1, CASE 
            WHEN package_amount >= 12750 THEN 255
            WHEN package_amount >= 6350 THEN 127
            WHEN package_amount >= 3150 THEN 63
            WHEN package_amount >= 1550 THEN 31
            WHEN package_amount >= 750 THEN 15
            WHEN package_amount >= 350 THEN 7
            WHEN package_amount >= 150 THEN 3
            ELSE 1
        END) AS i
        ON CONFLICT (node_id) DO NOTHING;

        -- Trigger rank check for the user themselves
        PERFORM public.check_and_update_rank(NEW.uid::uuid);

        -- 2. Referral Bonus (5% to direct sponsor)
        SELECT p.sponsor_id INTO sponsor_id FROM public.profiles p WHERE p.id = NEW.uid::uuid;
        
        IF sponsor_id IS NOT NULL THEN
            referral_bonus := package_amount * 0.05;
            
            INSERT INTO public.payments (uid, amount, type, status, order_description)
            VALUES (sponsor_id, referral_bonus, 'referral_bonus', 'finished', 'DIRECT REFERRAL YIELD from ' || NEW.uid::text);
            
            -- Trigger rank check for sponsor
            PERFORM public.check_and_update_rank(sponsor_id);
        END IF;

        -- 3. Traverse up to update ancestors' volume
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = NEW.uid::uuid;

        WHILE current_parent_id IS NOT NULL LOOP
            -- Update the parent's matching volume AND cumulative volume
            -- Use units of $50 for matching volume
            UPDATE public.profiles
            SET matching_volume = jsonb_set(
                    COALESCE(matching_volume, '{"left": 0, "right": 0}'::jsonb), 
                    ARRAY[lower(current_side)], 
                    to_jsonb((COALESCE(matching_volume->>lower(current_side), '0'))::numeric + (package_amount / 50.0))
                ),
                cumulative_volume = jsonb_set(
                    COALESCE(cumulative_volume, '{"left": 0, "right": 0}'::jsonb), 
                    ARRAY[lower(current_side)], 
                    to_jsonb((COALESCE(cumulative_volume->>lower(current_side), '0'))::numeric + (package_amount / 50.0))
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

-- 4. Fix check_and_update_rank to use cumulative_volume
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
    SELECT rank, (cumulative_volume->>'left')::numeric, (cumulative_volume->>'right')::numeric, active_package
    INTO u_rank, u_left_vol, u_right_vol, u_active_pkg
    FROM public.profiles
    WHERE id = user_id::uuid;

    -- Only active users can have ranks
    IF u_active_pkg IS NULL OR u_active_pkg <= 0 THEN
        IF u_rank > 0 THEN
            UPDATE public.profiles SET rank = 0, rank_name = 'New Partner' WHERE id = user_id::uuid;
        END IF;
        RETURN;
    END IF;

    new_rank := u_rank;

    -- Rank 1: Partner (Active Account)
    IF u_rank = 0 AND u_active_pkg > 0 THEN
        new_rank := 1;
    END IF;

    -- Rank Criteria (based on cumulative volume)
    IF u_left_vol >= 10000 AND u_right_vol >= 10000 AND u_rank < 12 THEN
        new_rank := 12;
        reward_amount := 25000;
    ELSIF u_left_vol >= 5000 AND u_right_vol >= 5000 AND u_rank < 11 THEN
        new_rank := 11;
        reward_amount := 10000;
    ELSIF u_left_vol >= 2500 AND u_right_vol >= 2500 AND u_rank < 10 THEN
        new_rank := 10;
        reward_amount := 5000;
    ELSIF u_left_vol >= 1000 AND u_right_vol >= 1000 AND u_rank < 9 THEN
        new_rank := 9;
        reward_amount := 2500;
    ELSIF u_left_vol >= 500 AND u_right_vol >= 500 AND u_rank < 8 THEN
        new_rank := 8;
        reward_amount := 1000;
    ELSIF u_left_vol >= 250 AND u_right_vol >= 250 AND u_rank < 7 THEN
        new_rank := 7;
        reward_amount := 500;
    ELSIF u_left_vol >= 100 AND u_right_vol >= 100 AND u_rank < 6 THEN
        new_rank := 6;
        reward_amount := 250;
    ELSIF u_left_vol >= 31 AND u_right_vol >= 31 AND u_rank < 5 THEN
        new_rank := 5;
        reward_amount := 100;
    ELSIF u_left_vol >= 15 AND u_right_vol >= 15 AND u_rank < 4 THEN
        new_rank := 4;
        reward_amount := 50;
    ELSIF u_left_vol >= 7 AND u_right_vol >= 7 AND u_rank < 3 THEN
        new_rank := 3;
        reward_amount := 25;
    ELSIF u_left_vol >= 3 AND u_right_vol >= 3 AND u_rank < 2 THEN
        new_rank := 2;
        reward_amount := 10;
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

        IF reward_amount > 0 THEN
            INSERT INTO public.payments (uid, amount, type, status, order_description)
            VALUES (user_id, reward_amount, 'rank_reward', 'finished', 'RANK PROTOCOL BONUS for reaching Rank ' || new_rank);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Fix update_wallets_on_payment to be more robust
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    current_wallets JSONB;
    wallet_key TEXT;
    new_balance NUMERIC;
BEGIN
    -- Only process if status is finished
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        SELECT wallets INTO current_wallets FROM public.profiles WHERE id = NEW.uid::uuid;
        
        -- Ensure wallets is not null
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
            WHEN NEW.type = 'referral_bonus' THEN 'referral'
            WHEN NEW.type = 'matching_bonus' THEN 'matching'
            WHEN NEW.type = 'rank_reward' THEN 'rankBonus'
            WHEN NEW.type = 'incentive_accrual' THEN 'incentive'
            WHEN NEW.type = 'team_collection' THEN 'rewards'
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
            UPDATE public.profiles
            SET wallets = jsonb_set(
                    jsonb_set(current_wallets, ARRAY[wallet_key, 'balance'], to_jsonb((COALESCE(current_wallets->wallet_key->>'balance', '0'))::numeric + NEW.amount)),
                    ARRAY['master', 'balance'], to_jsonb((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + NEW.amount)
                ),
                total_income = total_income + CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END
            WHERE id = NEW.uid::uuid;
        ELSE
            -- Handle master wallet updates (deposits, withdrawals, package activations)
            new_balance := CASE 
                WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric - NEW.amount)
                ELSE 
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + NEW.amount)
            END;

            UPDATE public.profiles
            SET wallets = jsonb_set(current_wallets, ARRAY['master', 'balance'], to_jsonb(new_balance))
            WHERE id = NEW.uid::uuid;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
