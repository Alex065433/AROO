
import { supabaseService } from './services/supabaseService';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const subNodeId = '00000000-0000-0000-0000-000000000002';
  const subNodeOperatorId = 'TEST-NODE-02';
  const parentId = '38c04bee-44d5-4ea1-bf64-36ee6f7eaa93'; // ARW-123456
  
  const subNodeData = {
    id: subNodeId,
    email: `test-node-02@arowin.internal`,
    operator_id: subNodeOperatorId,
    name: `Test Node 02`,
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

  try {
    // We need to mock getCurrentUser to return an admin
    (supabaseService as any).getCurrentUser = () => ({
      operator_id: 'ADMIN_AROWIN_2026',
      role: 'admin'
    });

    const result = await supabaseService.adminQuery('profiles', 'insert', subNodeData);
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}
run();
