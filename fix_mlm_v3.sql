-- MLM Income & Rank Logic Fixes v3
-- 1. Update check_and_update_rank to only activate for $150+ packages
CREATE OR REPLACE FUNCTION public.check_and_update_rank(user_id UUID)
RETURNS VOID AS $$
DECLARE
    u_rank INTEGER;
    u_left_vol NUMERIC;
    u_right_vol NUMERIC;
    u_active_pkg NUMERIC;
    new_rank INTEGER;
    reward_amount NUMERIC := 0;
    current_wallets JSONB;
BEGIN
    SELECT rank, (COALESCE(cumulative_volume->>'left', '0'))::numeric, (COALESCE(cumulative_volume->>'right', '0'))::numeric, active_package, wallets
    INTO u_rank, u_left_vol, u_right_vol, u_active_pkg, current_wallets
    FROM public.profiles
    WHERE id = user_id;

    -- CRITICAL: Rank only activates if package is $150 or more
    IF u_active_pkg IS NULL OR u_active_pkg < 150 THEN
        IF u_rank > 0 THEN
            UPDATE public.profiles SET rank = 0, rank_name = 'New Partner' WHERE id = user_id;
        END IF;
        RETURN;
    END IF;

    new_rank := u_rank;

    -- Rank 1: Starter (Active Account >= 150)
    IF u_rank = 0 AND u_active_pkg >= 150 THEN
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
                WHEN new_rank = 3 THEN 'Sliver'
                WHEN new_rank = 4 THEN 'Gold'
                WHEN new_rank = 5 THEN 'Platina'
                WHEN new_rank = 6 THEN 'Diamond'
                WHEN new_rank = 7 THEN 'Blue Sapphire'
                WHEN new_rank = 8 THEN 'Ruby Eite'
                WHEN new_rank = 9 THEN 'Emerald Crown'
                WHEN new_rank = 10 THEN 'Titanium King'
                WHEN new_rank = 11 THEN 'Royal Lengend'
                WHEN new_rank = 12 THEN 'Global Ambassador'
                ELSE rank_name
            END
        WHERE id = user_id;

        IF reward_amount > 0 THEN
            INSERT INTO public.payments (uid, amount, type, status, order_description)
            VALUES (user_id, reward_amount, 'rank_reward', 'finished', 'RANK PROTOCOL BONUS for reaching Rank ' || new_rank);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update process_package_activation for team collection and incomes
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
        WHERE id = NEW.uid;

        -- 1.1 Generate Team Collection Nodes
        -- User request: 150$ -> 3 nodes.
        -- We'll adjust the ladder: 
        -- < 150: 0 nodes
        -- 150-249: 3 nodes
        -- 250-499: 15 nodes
        -- 500-999: 31 nodes
        -- 1000+: 63 nodes
        INSERT INTO public.team_collection (uid, node_id, name, balance, eligible, created_at)
        SELECT 
            NEW.uid,
            'NODE-' || substring(gen_random_uuid()::text from 1 for 8) || '-' || i,
            'Node ' || i || ' (Package ' || package_amount || ')',
            0,
            true,
            NOW()
        FROM generate_series(1, CASE 
            WHEN package_amount >= 1000 THEN 63
            WHEN package_amount >= 500 THEN 31
            WHEN package_amount >= 250 THEN 15
            WHEN package_amount >= 150 THEN 3
            ELSE 0
        END) AS i
        ON CONFLICT (node_id) DO NOTHING;

        -- 1.2 INCENTIVE POOL ACCRUAL (1% to the user themselves)
        INSERT INTO public.payments (uid, amount, type, status, order_description)
        VALUES (NEW.uid, package_amount * 0.01, 'incentive_accrual', 'finished', 'INCENTIVE POOL ACCRUAL for Package ' || package_amount);

        -- Trigger rank check for the user themselves
        PERFORM public.check_and_update_rank(NEW.uid);

        -- 2. DIRECT REFERRAL YIELD (5% to direct sponsor)
        SELECT p.sponsor_id INTO sponsor_id FROM public.profiles p WHERE p.id = NEW.uid;
        
        IF sponsor_id IS NOT NULL THEN
            referral_bonus := package_amount * 0.05;
            
            INSERT INTO public.payments (uid, amount, type, status, order_description)
            VALUES (sponsor_id, referral_bonus, 'referral_bonus', 'finished', 'DIRECT REFERRAL YIELD from ' || NEW.uid);
            
            -- Trigger rank check for sponsor
            PERFORM public.check_and_update_rank(sponsor_id);
        END IF;

        -- 3. Traverse up to update ancestors' volume for BINARY MATCHING DIVIDEND
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = NEW.uid;

        WHILE current_parent_id IS NOT NULL LOOP
            -- Update the parent's matching volume AND cumulative volume
            UPDATE public.profiles
            SET matching_volume = jsonb_set(
                    COALESCE(matching_volume, '{"left": 0, "right": 0}'::jsonb), 
                    '{' || lower(current_side) || '}', 
                    ((COALESCE(matching_volume->>lower(current_side), '0'))::numeric + package_amount)::text::jsonb
                ),
                cumulative_volume = jsonb_set(
                    COALESCE(cumulative_volume, '{"left": 0, "right": 0}'::jsonb), 
                    '{' || lower(current_side) || '}', 
                    ((COALESCE(cumulative_volume->>lower(current_side), '0'))::numeric + package_amount)::text::jsonb
                )
            WHERE id = current_parent_id;

            -- Trigger binary matching check for this parent
            PERFORM public.calculate_binary_matching(current_parent_id);
            
            -- Trigger rank check for this parent
            PERFORM public.check_and_update_rank(current_parent_id);

            -- Move up to the next parent
            SELECT parent_id, side INTO current_parent_id, current_side
            FROM public.profiles
            WHERE id = current_parent_id;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure wallets are updated for all income types
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    current_wallets JSONB;
    wallet_key TEXT;
    new_balance NUMERIC;
BEGIN
    -- Only process if status is finished
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        SELECT wallets INTO current_wallets FROM public.profiles WHERE id = NEW.uid;
        
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
            current_wallets := jsonb_set(current_wallets, '{' || wallet_key || '}', '{"balance": 0, "currency": "USDT"}'::jsonb);
        END IF;

        -- Update the specific wallet and the master wallet (except for deposits/withdrawals which are already master)
        IF wallet_key != 'master' THEN
            UPDATE public.profiles
            SET wallets = jsonb_set(
                    jsonb_set(current_wallets, '{' || wallet_key || ',balance}', ((COALESCE(current_wallets->wallet_key->>'balance', '0'))::numeric + NEW.amount)::text::jsonb),
                    '{master,balance}', ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + NEW.amount)::text::jsonb
                ),
                total_income = total_income + CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END
            WHERE id = NEW.uid;
        ELSE
            -- Handle master wallet updates (deposits, withdrawals, package activations)
            new_balance := CASE 
                WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric - NEW.amount)
                ELSE 
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + NEW.amount)
            END;

            UPDATE public.profiles
            SET wallets = jsonb_set(current_wallets, '{master,balance}', new_balance::text::jsonb)
            WHERE id = NEW.uid;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
