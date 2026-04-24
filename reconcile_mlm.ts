
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!, 
    process.env.VITE_SUPABASE_SERVICE_KEY!
);

const sql = `
-- 1. Unify and Fix Members Table
DO $$ 
BEGIN
    -- Check if members table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members' AND table_schema = 'public') THEN
        
        -- Fix column names if needed
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'left_pv') THEN
            ALTER TABLE public.members RENAME COLUMN left_pv TO left_points;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'right_pv') THEN
            ALTER TABLE public.members RENAME COLUMN right_pv TO right_points;
        END IF;

        -- Ensure position is TEXT for simplicity and check constraints
        -- (Converting from Enum to Text if needed)
        ALTER TABLE public.members ALTER COLUMN position TYPE TEXT;
        
        -- Drop old constraints
        ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_position_check;
        ALTER TABLE public.members ADD CONSTRAINT members_position_check CHECK (position IN ('LEFT', 'RIGHT'));

        -- Ensure UNIQUE constraint for binary integrity
        ALTER TABLE public.members DROP CONSTRAINT IF EXISTS unique_placement_position;
        ALTER TABLE public.members ADD CONSTRAINT unique_placement_position UNIQUE (placement_id, position);

        -- Ensure master_id column exists for Team Collection mapping
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'master_id') THEN
            ALTER TABLE public.members ADD COLUMN master_id UUID REFERENCES public.profiles(id);
        END IF;

    END IF;
END $$;

-- 2. Self-Healing: Populate members from profiles for any missing entries
INSERT INTO public.members (id, sponsor_id, is_active)
SELECT p.id, COALESCE(p.sponsor_id, (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1)), (p.status = 'active')
FROM public.profiles p
WHERE p.id NOT IN (SELECT id FROM public.members)
  AND p.is_virtual = false
ON CONFLICT (id) DO NOTHING;

-- 3. Fix income_ledger schema
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_ledger' AND column_name = 'operator_id') THEN
        ALTER TABLE public.income_ledger ADD COLUMN operator_id TEXT;
    END IF;
END $$;

-- 4. Fix team_collection schema
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_collection' AND column_name = 'package_amount') THEN
        ALTER TABLE public.team_collection ADD COLUMN package_amount NUMERIC DEFAULT 50;
    END IF;
END $$;
`;

async function main() {
    console.log('Synchronizing Binary System Architecture...');
    
    // Try different RPC names
    const rpcs = [
        { name: 'admin_execute_sql_rpc', param: 'p_sql' },
        { name: 'exec_sql', param: 'sql' },
        { name: 'execute_sql', param: 'sql' },
        { name: 'run_sql', param: 'sql' }
    ];

    let success = false;
    for (const rpc of rpcs) {
        console.log(`Attempting RPC: ${rpc.name}...`);
        const { data, error } = await supabase.rpc(rpc.name, { [rpc.param]: sql });
        if (!error) {
            console.log(`Success with RPC: ${rpc.name}`);
            success = true;
            break;
        } else {
            console.log(`${rpc.name} failed: ${error.message}`);
        }
    }

    if (!success) {
        console.error('All SQL execution RPCs failed. Please apply the SQL manually in Supabase Editor.');
        console.log('SQL Content:', sql);
    } else {
        console.log('System Architecture Unified Successfully.');
    }
}

main();
