import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Lazy-load Supabase client to prevent startup crashes if env vars are missing
let supabaseAdmin: any = null;
const getSupabaseAdmin = () => {
  if (supabaseAdmin) return supabaseAdmin;
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY || '';
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("Supabase environment variables are missing in admin-query.");
    return null;
  }
  
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  return supabaseAdmin;
};

router.post('/', async (req, res) => {
  const { table, operation, data, match } = req.body;
  const authToken = req.headers['x-auth-token'];

  if (authToken !== 'CORE_SECURE_999') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase client not initialized" });

  try {
    let query;
    if (operation === 'insert') {
      query = supabase.from(table).insert(data);
    } else if (operation === 'update') {
      query = supabase.from(table).update(data).match(match);
    } else if (operation === 'delete') {
      query = supabase.from(table).delete().match(match);
    } else {
      return res.status(400).json({ error: 'Invalid operation' });
    }

    const { data: result, error } = await query.select();
    if (error) throw error;

    res.json(result);
  } catch (error: any) {
    console.error(`Admin Query Error (${operation} on ${table}):`, error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
