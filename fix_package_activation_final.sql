-- Final Fix for Package Activation and Wallet Sync
-- This script fixes the variable name conflict in process_package_activation
-- and ensures both flat columns and JSONB wallets are updated correctly.

-- 1. Fix process_package_activation to avoid variable name conflicts
CREATE OR REPLACE FUNCTION public.process_package_activation()
RETURNS TRIGGER AS $$
DECLARE
    v_package_amount NUMERIC;
    v_sponsor_id UUID;
    v_referral_bonus NUMERIC;
    v_node_id TEXT;
BEGIN
    -- Only process if payment is finished and type is package_activation
    -- We handle both 'finished' and 'completed' for compatibility
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND NEW.type = 'package_activation' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        
        v_package_amount := NEW.amount;
        RAISE NOTICE 'Processing package activation for user % with amount %', NEW.uid, v_package_amount;

        -- 1. Update the user's own package info and status
        -- Use explicit variable names to avoid conflict with column names
        UPDATE public.profiles
        SET 
            active_package = v_package_amount,
            package_amount = v_package_amount,
            status = 'active'
        WHERE id = NEW.uid::uuid;

        -- 2. Generate Team Collection Nodes (3 nodes for each package)
        -- We use a more robust node_id generation to avoid collisions
        FOR i IN 1..3 LOOP
            v_node_id := 'node_' || NEW.uid::text || '_' || i || '_' || REPLACE(EXTRACT(EPOCH FROM NOW())::text, '.', '');
            INSERT INTO public.team_collection (uid, node_id, name, type, balance)
            VALUES (
                NEW.uid::uuid,
                v_node_id,
                'Mining Node ' || i,
                'mining',
                0
            ) ON CONFLICT (node_id) DO NOTHING;
        END LOOP;

        -- 3. Referral Bonus (10% of package amount)
        SELECT sponsor_id INTO v_sponsor_id FROM public.profiles WHERE id = NEW.uid::uuid;
        
        IF v_sponsor_id IS NOT NULL THEN
            v_referral_bonus := v_package_amount * 0.10;
            RAISE NOTICE 'Awarding referral bonus of % to sponsor %', v_referral_bonus, v_sponsor_id;
            
            -- Add referral bonus via payment record (trigger will handle wallet update)
            PERFORM public.admin_add_payment_rpc(
                v_sponsor_id::text,
                v_referral_bonus::text,
                'referral_bonus',
                'INTERNAL',
                'Referral Bonus from ' || NEW.uid::text,
                'finished'
            );
        END IF;

        -- 4. Trigger Rank Check
        PERFORM public.check_and_update_rank(NEW.uid::uuid);

        -- 5. Update Ancestor Volumes and Ranks
        -- This propagates the volume up the binary tree
        PERFORM public.update_ancestors_volume(NEW.uid::uuid, v_package_amount);
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix update_wallets_on_payment to be more robust
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    wallet_key TEXT;
    v_amount NUMERIC;
    current_wallets JSONB;
    new_balance NUMERIC;
BEGIN
    -- Only process if status is finished or completed
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        
        v_amount := NEW.amount;
        RAISE NOTICE 'Updating wallets for payment type % amount % user %', NEW.type, v_amount, NEW.uid;

        -- Determine which sub-wallet to update based on payment type
        wallet_key := CASE 
            WHEN NEW.type IN ('referral_bonus', 'referral_income') THEN 'referral'
            WHEN NEW.type IN ('matching_bonus', 'matching_income', 'binary_matching', 'binary_income') THEN 'matching'
            WHEN NEW.type IN ('rank_reward', 'rank_bonus') THEN 'rankBonus'
            WHEN NEW.type IN ('incentive_accrual', 'weekly_incentive', 'incentive_income') THEN 'incentive'
            WHEN NEW.type IN ('team_collection', 'reward_income', 'node_income') THEN 'rewards'
            ELSE 'master'
        END;

        -- Get current wallets
        SELECT wallets INTO current_wallets FROM public.profiles WHERE id = NEW.uid::uuid;
        IF current_wallets IS NULL THEN
            current_wallets := '{"master": {"balance": 0, "currency": "USDT"}, "referral": {"balance": 0, "currency": "USDT"}, "matching": {"balance": 0, "currency": "USDT"}, "rankBonus": {"balance": 0, "currency": "USDT"}, "incentive": {"balance": 0, "currency": "USDT"}, "rewards": {"balance": 0, "currency": "USDT"}}'::jsonb;
        END IF;

        -- Update the profiles table
        IF wallet_key != 'master' THEN
            -- Income types: Update specific income column, total_income, and both sub-wallet and master wallet
            UPDATE public.profiles
            SET 
                referral_income = CASE WHEN wallet_key = 'referral' THEN COALESCE(referral_income, 0) + v_amount ELSE referral_income END,
                matching_income = CASE WHEN wallet_key = 'matching' THEN COALESCE(matching_income, 0) + v_amount ELSE matching_income END,
                total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                wallets = jsonb_set(
                    jsonb_set(
                        current_wallets,
                        ARRAY[wallet_key, 'balance'], 
                        to_jsonb(((COALESCE(current_wallets->wallet_key->>'balance', '0'))::numeric + v_amount))
                    ),
                    ARRAY['master', 'balance'], 
                    to_jsonb(((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + v_amount))
                )
            WHERE id = NEW.uid::uuid;
        ELSE
            -- Master wallet updates (deposits, withdrawals, package activations)
            new_balance := CASE 
                WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                    COALESCE(wallet_balance, 0) - v_amount
                WHEN NEW.type = 'deposit' OR NEW.type = 'admin_deposit' THEN
                    COALESCE(wallet_balance, 0) + v_amount
                ELSE 
                    wallet_balance
            END;

            UPDATE public.profiles
            SET 
                wallet_balance = new_balance,
                wallets = jsonb_set(
                    current_wallets,
                    ARRAY['master', 'balance'], 
                    to_jsonb(CASE 
                        WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                            ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric - v_amount)
                        WHEN NEW.type = 'deposit' OR NEW.type = 'admin_deposit' THEN
                            ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + v_amount)
                        ELSE 
                            (COALESCE(current_wallets->'master'->>'balance', '0'))::numeric
                    END)
                )
            WHERE id = NEW.uid::uuid;
        END IF;

        -- Log to transactions table
        INSERT INTO public.transactions (uid, amount, type, description)
        VALUES (NEW.uid::uuid, NEW.amount, NEW.type, COALESCE(NEW.order_description, NEW.type) || ' (' || NEW.type || ')');
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Consolidate admin_add_payment_rpc to a single robust version
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_add_payment_rpc(
    p_uid TEXT, 
    p_amount TEXT, 
    p_type TEXT, 
    p_method TEXT, 
    p_description TEXT,
    p_status TEXT DEFAULT 'finished',
    p_payment_id TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'usdtbsc',
    p_order_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_payment_id UUID;
    v_numeric_amount NUMERIC;
BEGIN
    -- Cast amount to numeric
    v_numeric_amount := p_amount::NUMERIC;

    -- Insert payment record
    INSERT INTO public.payments (
        uid, 
        amount, 
        type, 
        status, 
        method, 
        order_description, 
        payment_id,
        currency,
        order_id
    ) VALUES (
        p_uid::UUID, 
        v_numeric_amount, 
        p_type, 
        p_status, 
        p_method, 
        p_description, 
        p_payment_id,
        p_currency,
        p_order_id
    )
    RETURNING id INTO v_payment_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fix admin_add_funds to use the payment trigger system
CREATE OR REPLACE FUNCTION public.admin_add_funds(
    p_user_id UUID,
    p_amount NUMERIC
)
RETURNS JSONB AS $$
BEGIN
    -- We just call admin_add_payment_rpc which inserts into payments
    -- The trigger on_payment_update_wallets will handle the balance update
    RETURN public.admin_add_payment_rpc(
        p_user_id::text,
        p_amount::text,
        'admin_deposit',
        'ADMIN',
        'Admin added funds',
        'finished'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Ensure triggers are correctly set up
DROP TRIGGER IF EXISTS on_payment_update_process_package ON public.payments;
CREATE TRIGGER on_payment_update_process_package
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.process_package_activation();

DROP TRIGGER IF EXISTS on_payment_update_wallets ON public.payments;
CREATE TRIGGER on_payment_update_wallets
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_wallets_on_payment();

-- 6. Sync existing wallet_balance with JSONB wallets to fix current display issues
UPDATE public.profiles 
SET wallet_balance = (COALESCE(wallets->'master'->>'balance', '0'))::numeric;

-- 7. Grant permissions
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_add_funds(UUID, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(UUID, NUMERIC) TO service_role;
