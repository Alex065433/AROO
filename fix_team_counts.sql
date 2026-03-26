-- Fix for Binary Tree Team Counts
-- This script updates the trigger to handle updates (when parent_id/side are set after initial creation)
-- and provides a way to rebuild the counts.

-- 1. Update the trigger function to handle UPDATE
CREATE OR REPLACE FUNCTION public.update_ancestors_team_size()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
BEGIN
    -- If it's an update, check if parent_id or side changed from NULL
    IF (TG_OP = 'UPDATE') THEN
        IF (OLD.parent_id IS NULL AND NEW.parent_id IS NOT NULL) THEN
            current_parent_id := NEW.parent_id;
            current_side := NEW.side;
        ELSE
            -- If parent_id or side didn't change from NULL to something, we don't handle it here
            -- unless we want to handle moving nodes, which is more complex.
            RETURN NEW;
        END IF;
    ELSE
        -- INSERT case
        current_parent_id := NEW.parent_id;
        current_side := NEW.side;
    END IF;

    WHILE current_parent_id IS NOT NULL LOOP
        -- Update the parent's team size
        IF current_side = 'LEFT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), ARRAY['left'], to_jsonb((COALESCE(team_size->>'left', '0'))::int + 1))
            WHERE id = current_parent_id::uuid;
        ELSIF current_side = 'RIGHT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), ARRAY['right'], to_jsonb((COALESCE(team_size->>'right', '0'))::int + 1))
            WHERE id = current_parent_id::uuid;
        END IF;

        -- Move up to the next parent
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = current_parent_id::uuid;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add the UPDATE trigger
DROP TRIGGER IF EXISTS on_user_updated_update_team_size ON public.profiles;
CREATE TRIGGER on_user_updated_update_team_size
  AFTER UPDATE OF parent_id, side ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_ancestors_team_size();

-- 3. Rebuild all counts now
SELECT public.rebuild_team_sizes();
