
import { Rank, User, TeamMember, Notification } from './types';

export const RANK_NAMES = [
  'Starter', 'Bronze', 'Silver',
  'Gold', 'Platina', 'Diamond',
  'Blue Sapphire', 'Ruby Elite', 'Emerald Crown',
  'Titanium King', 'Royal Legend', 'Global Ambassador'
];

const RANK_DATA = [
  { required: 1, weekly: 4, capping: 5, pairIncome: 5, reward: 0 },     // Starter: 1L - 1R
  { required: 3, weekly: 6, capping: 5, pairIncome: 5, reward: 0 },     // Bronze: 3L - 3R
  { required: 7, weekly: 10, capping: 5, pairIncome: 5, reward: 0 },    // Silver: 7L - 7R
  { required: 15, weekly: 16, capping: 5, pairIncome: 5, reward: 0 },   // Gold: 15L - 15R
  { required: 31, weekly: 31, capping: 5, pairIncome: 5, reward: 0 },   // Platina: 31L - 31R
  { required: 100, weekly: 50, capping: 5, pairIncome: 5, reward: 0 },  // Diamond: 100L - 100R
  { required: 250, weekly: 125, capping: 5, pairIncome: 5, reward: 0 }, // Blue Sapphire: 250L - 250R
  { required: 500, weekly: 250, capping: 5, pairIncome: 5, reward: 0 }, // Ruby Elite: 500L - 500R
  { required: 1000, weekly: 500, capping: 5, pairIncome: 5, reward: 0 }, // Emerald Crown: 1000L - 1000R
  { required: 2500, weekly: 1000, capping: 5, pairIncome: 5, reward: 0 }, // Titanium King: 2500L - 2500R
  { required: 5000, weekly: 2500, capping: 5, pairIncome: 5, reward: 0 }, // Royal Legend: 5000L - 5000R
  { required: 10000, weekly: 10000, capping: 5, pairIncome: 5, reward: 0 }, // Global Ambassador: 10000L - 10000R
];

export const PACKAGES = [
  { id: 'activation', name: 'Package 1', price: 50, nodes: 1, dailyCapping: 5, weeklyEarning: 0, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'starter', name: 'Package 2', price: 150, nodes: 3, dailyCapping: 5, weeklyEarning: 4, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'bronze', name: 'Package 3', price: 350, nodes: 7, dailyCapping: 5, weeklyEarning: 12, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'silver', name: 'Package 4', price: 750, nodes: 15, dailyCapping: 5, weeklyEarning: 30, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'gold', name: 'Package 5', price: 1550, nodes: 31, dailyCapping: 5, weeklyEarning: 70, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'platinum', name: 'Package 6', price: 3150, nodes: 63, dailyCapping: 5, weeklyEarning: 156, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'diamond', name: 'Package 7', price: 6350, nodes: 127, dailyCapping: 5, weeklyEarning: 343, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'ambassador', name: 'Package 8', price: 12750, nodes: 255, dailyCapping: 5, weeklyEarning: 700, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
];

export const RANKS: Rank[] = RANK_NAMES.map((name, i) => {
  const level = i + 1;
  const data = RANK_DATA[i];
  return {
    level,
    name,
    requiredLeft: data.required,
    requiredRight: data.required,
    weeklyEarning: data.weekly,
    duration: 52,
    totalEarning: data.weekly * 52,
    dailyCapping: data.capping,
    pairIncome: data.pairIncome,
    reward: data.reward,
  };
});

export const MOCK_USER: User = {
  id: 'mock-id',
  name: 'Operator',
  email: 'operator@arowintrading.com',
  mobile: '+91 9876543210',
  operator_id: 'ARW-XXXX',
  sponsor_id: 'SPN-001',
  rank: 4,
  wallet_balance: 0,
  totalEarnings: 12540.50,
  wallets: {
    master: { balance: 0, currency: 'USDT' },
    referral: { balance: 0, currency: 'USDT' },
    matching: { balance: 0, currency: 'USDT' },
    yield: { balance: 0, currency: 'USDT' },
    rankBonus: { balance: 0, currency: 'USDT' },
    incentive: { balance: 0, currency: 'USDT' },
    rewards: { balance: 0, currency: 'USDT' },
    capping_box: { balance: 0, currency: 'USDT' },
  },
  team_size: { left: 22, right: 18 },
  matched_pairs: 18,
  role: 'user' as const,
  status: 'active',
  active_package: 0,
  created_at: new Date().toISOString(),
  matching_income: 0,
  referral_income: 0,
  rank_bonus_income: 0,
  yield_income: 0,
  incentive_income: 0,
};

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: '1', title: 'System Synchronized', message: 'Your node is now fully synced with the Arowin mainnet protocol.', time: '2 mins ago', type: 'update', isNew: true },
  { id: '2', title: 'Reward Distribution', message: 'Matching bonus of 45.00 USDT has been credited to your node.', time: '1 hour ago', type: 'reward', isNew: true },
  { id: '3', title: 'Network Maintenance', message: 'Global node synchronization will occur at 00:00 UTC for performance tuning.', time: '5 hours ago', type: 'alert', isNew: false },
];

export const MOCK_TEAM_LIST: TeamMember[] = [
  { sNo: 1, username: 'AR88963772', name: 'Partner Node', masterWallet: '9.50 USDT', eligible: 'N/A' },
  { sNo: 2, username: 'AR84312318', name: 'Partner Node', masterWallet: '9.50 USDT', eligible: 'N/A' },
  { sNo: 3, username: 'AR84747872', name: 'Partner Node', masterWallet: '5.70 USDT', eligible: 'N/A' },
  { sNo: 4, username: 'AR79964742', name: 'Partner Node', masterWallet: '5.70 USDT', eligible: 'N/A' },
  { sNo: 5, username: 'AR13651554', name: 'Partner Node', masterWallet: '5.70 USDT', eligible: 'N/A' },
  { sNo: 6, username: 'AR30678650', name: 'Partner Node', masterWallet: '5.70 USDT', eligible: 'N/A' },
  { sNo: 7, username: 'AR24259894', name: 'Partner Node', masterWallet: '3.80 USDT', eligible: 'N/A' },
  { sNo: 8, username: 'AR15800522', name: 'Partner Node', masterWallet: '3.80 USDT', eligible: 'N/A' },
  { sNo: 9, username: 'AR99437554', name: 'Partner Node', masterWallet: '3.80 USDT', eligible: 'N/A' },
];

export const MOCK_CHART_DATA = [
  { name: 'W1', value: 400 }, { name: 'W2', value: 700 },
  { name: 'W3', value: 600 }, { name: 'W4', value: 1200 },
  { name: 'W5', value: 1100 }, { name: 'W6', value: 1800 },
  { name: 'W7', value: 1500 }, { name: 'W8', value: 2400 },
];
