
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const subNodeId = '00000000-0000-0000-0000-000000000001';
  const subNodeOperatorId = 'TEST-NODE-01';
  const parentId = '38c04bee-44d5-4ea1-bf64-36ee6f7eaa93'; // ARW-123456
  
  const subNodeData = {
    id: subNodeId,
    email: `test-node-01@arowin.internal`,
    operator_id: subNodeOperatorId,
    name: `Test Node 01`,
    sponsor_id: parentId,
    parent_id: parentId,
    side: 'RIGHT',
    status: 'active',
    role: 'user',
    active_package: 50,
    package_amount: 50,
    wallet_balance: 0,
    total_income: 0,
    wallets: {
      master: { balance: 0, currency: 'USDT' },
      referral: { balance: 0, currency: 'USDT' },
      matching: { balance: 0, currency: 'USDT' },
      yield: { balance: 0, currency: 'USDT' },
      rankBonus: { balance: 0, currency: 'USDT' },
      incentive: { balance: 0, currency: 'USDT' },
      rewards: { balance: 0, currency: 'USDT' },
    },
    team_size: { left: 0, right: 0 },
    matching_volume: { left: 0, right: 0 },
    created_at: new Date().toISOString()
  };

  const { error } = await supabase.from('profiles').insert(subNodeData);
  console.log('Insert Error:', error);
}
check();
