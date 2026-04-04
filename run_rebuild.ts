import { supabaseService } from './services/supabaseService';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    console.log('Starting network rebuild...');
    const result = await supabaseService.rebuildNetwork();
    console.log('Rebuild result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Rebuild failed:', err);
    process.exit(1);
  }
}

run();
