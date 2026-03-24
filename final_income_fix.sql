-- 1. Create Notifications Table if not exists
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'update', -- 'alert', 'update', 'reward'
    is_new BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid()::uuid = uid);
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid()::uuid = uid);

-- 2. Notification Trigger on Payments
CREATE OR REPLACE FUNCTION public.on_payment_notification_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process if status is finished or completed
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        IF NEW.type = 'deposit' THEN
            INSERT INTO public.notifications (uid, title, message, type)
            VALUES (NEW.uid::uuid, 'Deposit Successful', 'Your deposit of ' || NEW.amount || ' USDT has been processed.', 'update');
        ELSIF NEW.type = 'withdrawal' THEN
            INSERT INTO public.notifications (uid, title, message, type)
            VALUES (NEW.uid::uuid, 'Withdrawal Successful', 'Your withdrawal of ' || NEW.amount || ' USDT has been completed.', 'alert');
        ELSIF NEW.type = 'package_activation' THEN
            INSERT INTO public.notifications (uid, title, message, type)
            VALUES (NEW.uid::uuid, 'Package Activated', 'Your package of ' || NEW.amount || ' USDT is now active.', 'reward');
        ELSIF NEW.type IN ('referral_bonus', 'referral_income') THEN
            INSERT INTO public.notifications (uid, title, message, type)
            VALUES (NEW.uid::uuid, 'Referral Bonus', 'You received a referral bonus of ' || NEW.amount || ' USDT.', 'reward');
        ELSIF NEW.type IN ('matching_bonus', 'matching_income') THEN
            INSERT INTO public.notifications (uid, title, message, type)
            VALUES (NEW.uid::uuid, 'Matching Bonus', 'You received a matching bonus of ' || NEW.amount || ' USDT.', 'reward');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_payment_notification ON public.payments;
CREATE TRIGGER on_payment_notification
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.on_payment_notification_trigger();

-- 3. Fix process_package_activation (Remove incentive pool accrual and redundant volume propagation)
CREATE OR REPLACE FUNCTION public.process_package_activation()
RETURNS TRIGGER AS $$
DECLARE
    package_amount NUMERIC;
    sponsor_id UUID;
    referral_bonus NUMERIC;
BEGIN
    -- Only process if payment is finished and type is package_activation
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND NEW.type = 'package_activation' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        package_amount := NEW.amount;

        -- 1. Update the user's own package info and status
        -- This will trigger update_ancestors_team_size on the profiles table
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

        -- REMOVED: Incentive Pool Accrual (per user request)

        -- Trigger rank check for the user themselves
        PERFORM public.check_and_update_rank(NEW.uid::uuid);

        -- 2. Referral Bonus (5% to direct sponsor)
        SELECT p.sponsor_id INTO sponsor_id FROM public.profiles p WHERE p.id = NEW.uid::uuid;
        
        IF sponsor_id IS NOT NULL THEN
            referral_bonus := package_amount * 0.05;
            
            -- Use update_user_wallet to ensure it goes through the payments trigger
            PERFORM public.update_user_wallet(
                sponsor_id, 
                'referral', 
                referral_bonus, 
                'referral_bonus', 
                'DIRECT REFERRAL YIELD from ' || NEW.uid::text
            );
            
            -- Trigger rank check for sponsor
            PERFORM public.check_and_update_rank(sponsor_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fix update_ancestors_team_size (Ensure volume is in units of $50)
CREATE OR REPLACE FUNCTION public.update_ancestors_team_size()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
    volume_to_add NUMERIC := 0;
    should_increment_team_size BOOLEAN := FALSE;
BEGIN
    -- Only proceed if we have a parent and a side
    IF NEW.parent_id IS NULL OR NEW.side IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        should_increment_team_size := TRUE;
        IF NEW.active_package >= 50 THEN
            volume_to_add := NEW.active_package / 50;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Case 1: Initial placement (parent_id/side changed from NULL)
        IF (OLD.parent_id IS NULL OR OLD.side IS NULL) AND (NEW.parent_id IS NOT NULL AND NEW.side IS NOT NULL) THEN
            should_increment_team_size := TRUE;
            IF NEW.active_package >= 50 THEN
                volume_to_add := NEW.active_package / 50;
            END IF;
        -- Case 2: Package activation/upgrade (active_package changed)
        ELSIF (OLD.active_package IS DISTINCT FROM NEW.active_package) AND NEW.active_package >= 50 THEN
            -- Calculate difference in units
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
        -- Update the parent's team size and volume
        UPDATE public.profiles
        SET 
            team_size = CASE 
                WHEN should_increment_team_size THEN
                    jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], ((COALESCE(team_size->>lower(current_side), '0'))::int + 1)::text::jsonb)
                ELSE team_size
            END,
            matching_volume = CASE 
                WHEN volume_to_add > 0 THEN 
                    jsonb_set(COALESCE(matching_volume, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], ((COALESCE(matching_volume->>lower(current_side), '0'))::numeric + volume_to_add)::text::jsonb)
                ELSE matching_volume 
            END,
            cumulative_volume = CASE 
                WHEN volume_to_add > 0 THEN 
                    jsonb_set(COALESCE(cumulative_volume, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], ((COALESCE(cumulative_volume->>lower(current_side), '0'))::numeric + volume_to_add)::text::jsonb)
        ELSE cumulative_volume 
    END
WHERE id = current_parent_id::uuid;

-- Trigger matching and rank check for this parent if volume was added
IF volume_to_add > 0 THEN
    PERFORM public.calculate_binary_matching(current_parent_id::uuid);
    PERFORM public.check_and_update_rank(current_parent_id::uuid);
END IF;

-- Move up to the next parent
SELECT parent_id, side INTO current_parent_id, current_side
FROM public.profiles
WHERE id = current_parent_id::uuid;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Fix update_wallets_on_payment (Robust wallet updates)
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    wallet_key TEXT;
BEGIN
    -- Only process if status is finished
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        
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

        IF wallet_key != 'master' THEN
            UPDATE public.profiles
            SET wallets = jsonb_set(
                    jsonb_set(
                        COALESCE(wallets, '{"master": {"balance": 0, "currency": "USDT"}, "referral": {"balance": 0, "currency": "USDT"}, "matching": {"balance": 0, "currency": "USDT"}, "rankBonus": {"balance": 0, "currency": "USDT"}, "incentive": {"balance": 0, "currency": "USDT"}, "rewards": {"balance": 0, "currency": "USDT"}}'::jsonb),
                        ARRAY[wallet_key, 'balance'], 
                        ((COALESCE(wallets->wallet_key->>'balance', '0'))::numeric + NEW.amount)::text::jsonb
                    ),
                    ARRAY['master', 'balance'], 
                    ((COALESCE(wallets->'master'->>'balance', '0'))::numeric + NEW.amount)::text::jsonb
                ),
                total_income = COALESCE(total_income, 0) + CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END
            WHERE id = NEW.uid::uuid;
        ELSE
            -- Handle master wallet updates (deposits, withdrawals, package activations)
            UPDATE public.profiles
            SET wallets = jsonb_set(
                    COALESCE(wallets, '{"master": {"balance": 0, "currency": "USDT"}, "referral": {"balance": 0, "currency": "USDT"}, "matching": {"balance": 0, "currency": "USDT"}, "rankBonus": {"balance": 0, "currency": "USDT"}, "incentive": {"balance": 0, "currency": "USDT"}, "rewards": {"balance": 0, "currency": "USDT"}}'::jsonb),
                    ARRAY['master', 'balance'], 
                    (CASE 
                        WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                            ((COALESCE(wallets->'master'->>'balance', '0'))::numeric - NEW.amount)
                        WHEN NEW.type = 'deposit' THEN
                            ((COALESCE(wallets->'master'->>'balance', '0'))::numeric + NEW.amount)
                        ELSE 
                            (COALESCE(wallets->'master'->>'balance', '0'))::numeric
                    END)::text::jsonb
                )
            WHERE id = NEW.uid::uuid;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
