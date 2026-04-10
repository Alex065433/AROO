
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function fixSides() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, operator_id, side, parent_id');
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  for (const p of profiles) {
    if (p.parent_id && !p.side) {
      console.log(`Fixing NULL side for ${p.operator_id} (parent: ${p.parent_id})`);
      
      // Check existing children of this parent
      const { data: siblings } = await supabase
        .from('profiles')
        .select('side')
        .eq('parent_id', p.parent_id);
      
      const occupiedSides = (siblings || []).map(s => s.side).filter(Boolean);
      let newSide = 'LEFT';
      if (occupiedSides.includes('LEFT')) {
        newSide = 'RIGHT';
      }
      
      console.log(`Assigning side ${newSide} to ${p.operator_id}`);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ side: newSide })
        .eq('id', p.id);
      
      if (updateError) {
        console.error(`Failed to update ${p.operator_id}:`, updateError.message);
      }
    }
  }
  console.log('Fix complete.');
}

fixSides();
