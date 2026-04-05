
import { Rank, User, TeamMember, Notification } from './types';

const RANK_NAMES = [
  'Starter', 'Bronze', 'Silver',
  'Gold', 'Platina', 'Diamond',
  'Blue Sapphire', 'Ruby Elite', 'Emerald Crown',
  'Titanium King', 'Royal Legend', 'Global Ambassador'
];

const RANK_DATA = [
  { required: 1, weekly: 4, capping: 5, pairIncome: 5, reward: 0 },
  { required: 3, weekly: 6, capping: 5, pairIncome: 5, reward: 0 },
  { required: 7, weekly: 10, capping: 5, pairIncome: 5, reward: 0 },
  { required: 15, weekly: 16, capping: 5, pairIncome: 5, reward: 0 },
  { required: 31, weekly: 31, capping: 5, pairIncome: 5, reward: 0 },
  { required: 100, weekly: 50, capping: 5, pairIncome: 5, reward: 0 },
  { required: 250, weekly: 125, capping: 5, pairIncome: 5, reward: 0 },
  { required: 500, weekly: 250, capping: 5, pairIncome: 5, reward: 0 },
  { required: 1000, weekly: 500, capping: 5, pairIncome: 5, reward: 0 },
  { required: 2500, weekly: 1000, capping: 5, pairIncome: 5, reward: 0 },
  { required: 5000, weekly: 2500, capping: 5, pairIncome: 5, reward: 0 },
  { required: 10000, weekly: 10000, capping: 5, pairIncome: 5, reward: 0 },
];

export const MOCK_USER = {
  id: 'mock-user-id',
  name: 'Mock Operator',
  operator_id: 'ARW-000000',
  wallets: {
    master: { balance: 100, currency: 'USDT' },
    referral: { balance: 50, currency: 'USDT' },
    matching: { balance: 25, currency: 'USDT' },
    yield: { balance: 10, currency: 'USDT' },
    rankBonus: { balance: 5, currency: 'USDT' },
    rewards: { balance: 0, currency: 'USDT' },
    capping_box: { balance: 0, currency: 'USDT' }
  }
};

export const PACKAGES = [
  { id: 'activation', name: 'ID Activation', price: 50, nodes: 1, dailyCapping: 5, weeklyEarning: 0, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'starter', name: 'Starter Node', price: 150, nodes: 3, dailyCapping: 5, weeklyEarning: 4, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'bronze', name: 'Bronze Node', price: 350, nodes: 7, dailyCapping: 5, weeklyEarning: 12, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'silver', name: 'Silver Node', price: 750, nodes: 15, dailyCapping: 5, weeklyEarning: 30, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'gold', name: 'Gold Node', price: 1550, nodes: 31, dailyCapping: 5, weeklyEarning: 70, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'platinum', name: 'Platinum Node', price: 3150, nodes: 63, dailyCapping: 5, weeklyEarning: 156, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'diamond', name: 'Diamond Node', price: 6350, nodes: 127, dailyCapping: 5, weeklyEarning: 343, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
  { id: 'ambassador', name: 'Ambassador Node', price: 12750, nodes: 255, dailyCapping: 5, weeklyEarning: 700, features: ['5% Direct Referral Yield', '10% Matching Dividend', 'Weekly ROI Yield', 'Node Security Protocol'] },
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
