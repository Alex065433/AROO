-- 1. Ensure team_size and matching_volume are initialized
UPDATE public.profiles SET team_size = '{"left": 0, "right": 0}'::jsonb WHERE team_size IS NULL;
UPDATE public.profiles SET matching_volume = '{"left": 0, "right": 0}'::jsonb WHERE matching_volume IS NULL;

-- 2. Function to rebuild all binary stats (team_size and matching_volume)
CREATE OR REPLACE FUNCTION public.rebuild_binary_stats()
RETURNS VOID AS $$
DECLARE
    p RECORD;
    pkg RECORD;
BEGIN
    -- Reset all counts and volumes
    UPDATE public.profiles 
    SET team_size = '{"left": 0, "right": 0}'::jsonb,
        matching_volume = '{"left": 0, "right": 0}'::jsonb;
    
    -- Rebuild team_size
    FOR p IN SELECT id, parent_id, side FROM public.profiles WHERE parent_id IS NOT NULL LOOP
        DECLARE
            curr_parent_id UUID := p.parent_id;
            curr_side TEXT := p.side;
            next_parent_id UUID;
            next_side TEXT;
        BEGIN
            WHILE curr_parent_id IS NOT NULL LOOP
                IF curr_side = 'LEFT' THEN
                    UPDATE public.profiles
                    SET team_size = jsonb_set(team_size, '{left}', ((team_size->>'left')::int + 1)::text::jsonb)
                    WHERE id = curr_parent_id;
                ELSIF curr_side = 'RIGHT' THEN
                    UPDATE public.profiles
                    SET team_size = jsonb_set(team_size, '{right}', ((team_size->>'right')::int + 1)::text::jsonb)
                    WHERE id = curr_parent_id;
                END IF;
                
                SELECT parent_id, side INTO next_parent_id, next_side
                FROM public.profiles
                WHERE id = curr_parent_id;
                
                curr_parent_id := next_parent_id;
                curr_side := next_side;
            END LOOP;
        END;
    END LOOP;

    -- Rebuild matching_volume based on active packages
    FOR pkg IN SELECT uid, amount FROM public.payments WHERE type = 'package_activation' AND payment_status = 'finished' LOOP
        DECLARE
            p_profile RECORD;
            curr_parent_id UUID;
            curr_side TEXT;
            next_parent_id UUID;
            next_side TEXT;
        BEGIN
            SELECT parent_id, side INTO p_profile FROM public.profiles WHERE id = pkg.uid;
            IF p_profile.parent_id IS NOT NULL THEN
                curr_parent_id := p_profile.parent_id;
                curr_side := p_profile.side;
                
                WHILE curr_parent_id IS NOT NULL LOOP
                    IF curr_side = 'LEFT' THEN
                        UPDATE public.profiles
                        SET matching_volume = jsonb_set(matching_volume, '{left}', ((matching_volume->>'left')::numeric + pkg.amount)::text::jsonb)
                        WHERE id = curr_parent_id;
                    ELSIF curr_side = 'RIGHT' THEN
                        UPDATE public.profiles
                        SET matching_volume = jsonb_set(matching_volume, '{right}', ((matching_volume->>'right')::numeric + pkg.amount)::text::jsonb)
                        WHERE id = curr_parent_id;
                    END IF;
                    
                    SELECT parent_id, side INTO next_parent_id, next_side
                    FROM public.profiles
                    WHERE id = curr_parent_id;
                    
                    curr_parent_id := next_parent_id;
                    curr_side := next_side;
                END LOOP;
            END IF;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger for DELETE to keep team_size in sync
CREATE OR REPLACE FUNCTION public.update_ancestors_team_size_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
BEGIN
    current_parent_id := OLD.parent_id;
    current_side := OLD.side;

    WHILE current_parent_id IS NOT NULL LOOP
        IF current_side = 'LEFT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(team_size, '{left}', (GREATEST(0, (team_size->>'left')::int - 1))::text::jsonb)
            WHERE id = current_parent_id;
        ELSIF current_side = 'RIGHT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(team_size, '{right}', (GREATEST(0, (team_size->>'right')::int - 1))::text::jsonb)
            WHERE id = current_parent_id;
        END IF;

        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = current_parent_id;
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_deleted_update_team_size ON public.profiles;
CREATE TRIGGER on_user_deleted_update_team_size
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_ancestors_team_size_on_delete();

-- 4. Run the rebuild
SELECT public.rebuild_binary_stats();
