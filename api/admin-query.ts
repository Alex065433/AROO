import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase with service_role key to bypass RLS
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

router.post('/', async (req, res) => {
  const { table, operation, data, match } = req.body;
  const authToken = req.headers['x-auth-token'];

  if (authToken !== 'CORE_SECURE_999') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let query;
    if (operation === 'insert') {
      query = supabaseAdmin.from(table).insert(data);
    } else if (operation === 'update') {
      query = supabaseAdmin.from(table).update(data).match(match);
    } else if (operation === 'delete') {
      query = supabaseAdmin.from(table).delete().match(match);
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
