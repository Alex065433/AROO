-- final_fix_v3.sql
-- COMPREHENSIVE FIX for Admin Fund Addition and Binary Tree Counts

-- 1. CLEANUP: Remove all confusing/duplicate/incorrect functions
DROP FUNCTION IF EXISTS public.add_funds(uuid, numeric);
DROP FUNCTION IF EXISTS public.add_income(text, numeric);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(text, numeric, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.update_user_wallet(uuid, numeric);

-- 2. UPDATE: profiles table columns (ensure they exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='total_deposit') THEN
        ALTER TABLE public.profiles ADD COLUMN total_deposit NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_balance') THEN
        ALTER TABLE public.profiles ADD COLUMN wallet_balance NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='total_income') THEN
        ALTER TABLE public.profiles ADD COLUMN total_income NUMERIC DEFAULT 0;
    END IF;
END $$;

-- 3. UPDATE: update_wallets_on_payment trigger function
-- This function will now handle ALL wallet updates and JSONB synchronization.
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_amount NUMERIC;
BEGIN
    -- Only process if status is finished or completed
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        
        v_amount := NEW.amount;

        -- Update flat columns and JSONB wallets
        IF NEW.type IN ('referral_bonus', 'referral_income') THEN
            UPDATE public.profiles 
            SET referral_income = COALESCE(referral_income, 0) + v_amount,
                total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                wallets = jsonb_set(COALESCE(wallets, '{}'::jsonb), '{referral, balance}', to_jsonb((COALESCE(wallets->'referral'->>'balance', '0'))::numeric + v_amount))
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type IN ('matching_bonus', 'matching_income', 'binary_matching', 'binary_income') THEN
            UPDATE public.profiles 
            SET matching_income = COALESCE(matching_income, 0) + v_amount,
                total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                wallets = jsonb_set(COALESCE(wallets, '{}'::jsonb), '{matching, balance}', to_jsonb((COALESCE(wallets->'matching'->>'balance', '0'))::numeric + v_amount))
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type = 'deposit' OR NEW.type = 'admin_deposit' THEN
            UPDATE public.profiles 
            SET wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                total_deposit = CASE WHEN NEW.type = 'deposit' THEN COALESCE(total_deposit, 0) + v_amount ELSE total_deposit END,
                total_income = CASE WHEN NEW.type = 'admin_deposit' THEN COALESCE(total_income, 0) + v_amount ELSE total_income END,
                wallets = jsonb_set(COALESCE(wallets, '{}'::jsonb), '{master, balance}', to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount))
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type = 'withdrawal' THEN
            UPDATE public.profiles 
            SET wallet_balance = COALESCE(wallet_balance, 0) - v_amount,
                wallets = jsonb_set(COALESCE(wallets, '{}'::jsonb), '{master, balance}', to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric - v_amount))
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type = 'package_activation' THEN
            IF NEW.method = 'WALLET' THEN
                UPDATE public.profiles 
                SET wallet_balance = COALESCE(wallet_balance, 0) - v_amount,
                    wallets = jsonb_set(COALESCE(wallets, '{}'::jsonb), '{master, balance}', to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric - v_amount))
                WHERE id = NEW.uid::uuid;
            END IF;
        ELSE
            -- Default for other income types (rank_bonus, incentive_accrual, etc.)
            UPDATE public.profiles 
            SET total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                wallets = jsonb_set(COALESCE(wallets, '{}'::jsonb), '{master, balance}', to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount))
            WHERE id = NEW.uid::uuid;
        END IF;

        -- Log to transactions table
        INSERT INTO public.transactions (uid, amount, type, description)
        VALUES (NEW.uid::uuid, NEW.amount, NEW.type, COALESCE(NEW.order_description, NEW.type));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. CREATE: Single correct function for admin fund addition
-- This function now ONLY inserts into payments, letting the trigger handle the logic.
CREATE OR REPLACE FUNCTION public.admin_add_funds(
    p_user_id UUID,
    p_amount NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_new_balance NUMERIC;
BEGIN
    -- Log the transaction in the payments table
    -- The trigger 'update_wallets_on_payment' will handle profiles update.
    INSERT INTO public.payments (uid, amount, type, status, method, order_description, created_at)
    VALUES (p_user_id, p_amount, 'admin_deposit', 'finished', 'ADMIN', 'Admin added funds', NOW());

    -- Get the updated balance for the response
    SELECT wallet_balance INTO v_new_balance FROM public.profiles WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. CREATE: Correct internal payment RPC (using UUID and NUMERIC)
CREATE OR REPLACE FUNCTION public.admin_add_payment_rpc(
    p_uid UUID,
    p_amount NUMERIC,
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
BEGIN
    INSERT INTO public.payments (
        uid, amount, type, status, method, order_description, payment_id, currency, order_id, created_at
    )
    VALUES (
        p_uid, p_amount, p_type, p_status, p_method, p_description, p_payment_id, p_currency, p_order_id, NOW()
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

-- 6. FIX: update_ancestors_team_size to use to_jsonb for numbers
CREATE OR REPLACE FUNCTION public.update_ancestors_team_size()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
    volume_to_add NUMERIC := 0;
    should_increment_team_size BOOLEAN := FALSE;
BEGIN
    IF NEW.parent_id IS NULL OR NEW.side IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        should_increment_team_size := TRUE;
        IF NEW.active_package >= 50 THEN
            volume_to_add := NEW.active_package / 50;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF (OLD.parent_id IS NULL OR OLD.side IS NULL) AND (NEW.parent_id IS NOT NULL AND NEW.side IS NOT NULL) THEN
            should_increment_team_size := TRUE;
            IF NEW.active_package >= 50 THEN
                volume_to_add := NEW.active_package / 50;
            END IF;
        ELSIF (OLD.active_package IS DISTINCT FROM NEW.active_package) AND NEW.active_package >= 50 THEN
            IF COALESCE(OLD.active_package, 0) < 50 THEN
                volume_to_add := NEW.active_package / 50;
            ELSE
                volume_to_add := (NEW.active_package - OLD.active_package) / 50;
            END IF;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    IF volume_to_add <= 0 AND NOT should_increment_team_size THEN
        RETURN NEW;
    END IF;

    current_parent_id := NEW.parent_id;
    current_side := NEW.side;

    WHILE current_parent_id IS NOT NULL LOOP
        UPDATE public.profiles
        SET 
            team_size = CASE 
                WHEN should_increment_team_size THEN
                    jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], to_jsonb((COALESCE(team_size->>lower(current_side), '0'))::int + 1))
                ELSE team_size
            END,
            matching_volume = CASE 
                WHEN volume_to_add > 0 THEN 
                    jsonb_set(COALESCE(matching_volume, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], to_jsonb((COALESCE(matching_volume->>lower(current_side), '0'))::numeric + volume_to_add))
                ELSE matching_volume 
            END,
            cumulative_volume = CASE 
                WHEN volume_to_add > 0 THEN 
                    jsonb_set(COALESCE(cumulative_volume, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], to_jsonb((COALESCE(cumulative_volume->>lower(current_side), '0'))::numeric + volume_to_add))
                ELSE cumulative_volume 
            END
        WHERE id = current_parent_id::uuid;

        IF volume_to_add > 0 THEN
            PERFORM public.calculate_binary_matching(current_parent_id);
            PERFORM public.check_and_update_rank(current_parent_id);
        END IF;

        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = current_parent_id::uuid;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. REBUILD: Function to rebuild all network stats
CREATE OR REPLACE FUNCTION public.rebuild_network_stats()
RETURNS VOID AS $$
DECLARE
    p RECORD;
    curr_parent_id UUID;
    curr_side TEXT;
    volume_to_add NUMERIC;
BEGIN
    -- Reset all counts and volumes to 0
    UPDATE public.profiles SET 
        team_size = '{"left": 0, "right": 0}'::jsonb,
        matching_volume = '{"left": 0, "right": 0}'::jsonb,
        cumulative_volume = '{"left": 0, "right": 0}'::jsonb;
    
    -- For each profile, walk up its ancestors and increment
    FOR p IN SELECT id, parent_id, side, active_package FROM public.profiles WHERE parent_id IS NOT NULL AND side IS NOT NULL LOOP
        curr_parent_id := p.parent_id;
        curr_side := p.side;
        volume_to_add := CASE WHEN p.active_package >= 50 THEN p.active_package / 50 ELSE 0 END;
        
        WHILE curr_parent_id IS NOT NULL LOOP
            UPDATE public.profiles
            SET 
                team_size = jsonb_set(team_size, ARRAY[lower(curr_side)], to_jsonb((COALESCE(team_size->>lower(curr_side), '0'))::int + 1)),
                matching_volume = jsonb_set(matching_volume, ARRAY[lower(curr_side)], to_jsonb((COALESCE(matching_volume->>lower(curr_side), '0'))::numeric + volume_to_add)),
                cumulative_volume = jsonb_set(cumulative_volume, ARRAY[lower(curr_side)], to_jsonb((COALESCE(cumulative_volume->>lower(curr_side), '0'))::numeric + volume_to_add))
            WHERE id = curr_parent_id::uuid;
            
            SELECT parent_id, side INTO curr_parent_id, curr_side
            FROM public.profiles
            WHERE id = curr_parent_id::uuid;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. EXECUTE REBUILD
SELECT public.rebuild_network_stats();

-- 9. PERMISSIONS
GRANT EXECUTE ON FUNCTION public.admin_add_funds(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_network_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.rebuild_network_stats() TO authenticated;
