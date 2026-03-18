
import { Rank, User, TeamMember, Notification } from './types';

const RANK_NAMES = [
  'Starter', 'Bronze', 'Sliver',
  'Gold', 'Platina', 'Diamond',
  'Blue Sapphire', 'Ruby Eite', 'Emerald Crown',
  'Titanium King', 'Royal Lengend', 'Global Ambassador'
];

const RANK_DATA = [
  { required: 1, weekly: 4, capping: 250, pairIncome: 5 },
  { required: 3, weekly: 6, capping: 250, pairIncome: 5 },
  { required: 7, weekly: 10, capping: 250, pairIncome: 5 },
  { required: 15, weekly: 16, capping: 250, pairIncome: 5 },
  { required: 31, weekly: 31, capping: 250, pairIncome: 5 },
  { required: 100, weekly: 50, capping: 250, pairIncome: 5 },
  { required: 250, weekly: 125, capping: 250, pairIncome: 5 },
  { required: 500, weekly: 250, capping: 360, pairIncome: 6 },
  { required: 1000, weekly: 500, capping: 490, pairIncome: 7 },
  { required: 2500, weekly: 1000, capping: 640, pairIncome: 8 },
  { required: 5000, weekly: 2500, capping: 900, pairIncome: 10 },
  { required: 10000, weekly: 10000, capping: 2500, pairIncome: 25 },
];

export const PACKAGES = [
  { id: 'activation', name: 'ID Activation', price: 50, nodes: 1, features: ['Network Access', 'Basic Dividends'] },
  { id: 'starter', name: 'Starter Node', price: 150, nodes: 3, features: ['5% Pair Income', '250 USDT Capping'] },
  { id: 'bronze', name: 'Bronze Node', price: 350, nodes: 3, features: ['5% Pair Income', '250 USDT Capping'] },
  { id: 'silver', name: 'Silver Node', price: 750, nodes: 3, features: ['5% Pair Income', '250 USDT Capping'] },
  { id: 'gold', name: 'Gold Node', price: 1550, nodes: 3, features: ['5% Pair Income', '250 USDT Capping'] },
  { id: 'platinum', name: 'Platinum Node', price: 3150, nodes: 3, features: ['5% Pair Income', '250 USDT Capping'] },
  { id: 'diamond', name: 'Diamond Node', price: 6350, nodes: 3, features: ['5% Pair Income', '360 USDT Capping'] },
  { id: 'ambassador', name: 'Ambassador Node', price: 12750, nodes: 3, features: ['5% Pair Income', '490 USDT Capping'] },
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
  };
});

export const MOCK_USER: User = {
  id: 'ARW-XXXX',
  name: 'Operator',
  email: 'operator@arowin.com',
  mobile: '+91 9876543210',
  sponsorId: 'SPN-001',
  rank: 4, // Gold in the new system
  totalEarnings: 12540.50,
  wallets: {
    master: { balance: 15.20, currency: 'USDT' },
    referral: { balance: 2540.20, currency: 'USDT' },
    matching: { balance: 6820.50, currency: 'USDT' },
    rankBonus: { balance: 1200.00, currency: 'USDT' },
    rewards: { balance: 500.00, currency: 'USDT' },
  },
  teamSize: { left: 22, right: 18 },
  matchedPairs: 18,
  role: 'user' as const
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
