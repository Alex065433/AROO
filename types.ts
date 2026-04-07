
export interface Rank {
  level: number;
  name: string;
  requiredLeft: number;
  requiredRight: number;
  weeklyEarning: number;
  duration: number;
  totalEarning: number;
  dailyCapping: number;
  pairIncome: number;
  reward: number;
}

export interface Wallet {
  balance: number;
  currency: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  operator_id: string;
  sponsor_id: string;
  sponsorId?: string; // Legacy support
  rank: number;
  wallet_balance: number;
  wallets?: {
    master: Wallet;
    referral: Wallet;
    matching: Wallet;
    yield: Wallet;
    rankBonus: Wallet;
    incentive: Wallet;
    rewards: Wallet;
    capping_box?: Wallet;
  };
  matching_income: number;
  referral_income: number;
  rank_bonus_income: number;
  yield_income: number;
  incentive_income: number;
  team_size: {
    left: number;
    right: number;
  };
  matched_pairs: number;
  role: 'user' | 'admin';
  status: string;
  active_package: number;
  totalEarnings?: number;
  created_at: string;
}

export interface TeamMember {
  sNo: number;
  username: string;
  name: string;
  masterWallet: string;
  eligible: string;
  selected?: boolean;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'alert' | 'update' | 'reward';
  isNew: boolean;
}
