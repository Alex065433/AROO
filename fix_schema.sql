-- Fix for missing 'method' column in payments table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='method') THEN
        ALTER TABLE public.payments ADD COLUMN method TEXT DEFAULT 'CRYPTO';
    END IF;
END $$;

-- Ensure team_size is updated correctly for ancestors
CREATE OR REPLACE FUNCTION public.update_ancestors_team_size()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
BEGIN
    current_parent_id := NEW.parent_id;
    current_side := NEW.side;

    WHILE current_parent_id IS NOT NULL LOOP
        -- Update the parent's team size
        IF current_side = 'LEFT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(
                    COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), 
                    '{left}', 
                    to_jsonb((COALESCE(team_size->>'left', '0'))::int + 1)
                )
            WHERE id = current_parent_id::uuid;
        ELSIF current_side = 'RIGHT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(
                    COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), 
                    '{right}', 
                    to_jsonb((COALESCE(team_size->>'right', '0'))::int + 1)
                )
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

-- Re-apply trigger
DROP TRIGGER IF EXISTS on_user_inserted_update_team_size ON public.profiles;
CREATE TRIGGER on_user_inserted_update_team_size
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_ancestors_team_size();
