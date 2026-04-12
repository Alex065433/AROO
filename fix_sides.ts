
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSides() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, side, position');
  if (error) {
    console.error(error);
    return;
  }

  for (const p of profiles) {
    const expectedPosition = p.side ? p.side.toLowerCase() : null;
    if (p.position !== expectedPosition && expectedPosition) {
      console.log(`Fixing ${p.id}: position ${p.position} -> ${expectedPosition}`);
      const { error: updateError } = await supabase.from('profiles').update({ position: expectedPosition }).eq('id', p.id);
      if (updateError) {
        console.error(`Failed to update ${p.id}:`, updateError);
      }
    }
  }
}
fixSides();
