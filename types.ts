
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
  sponsorId: string;
  rank: number;
  totalEarnings: number;
  wallets: {
    master: Wallet;
    referral: Wallet;
    matching: Wallet;
    rankBonus: Wallet;
    incentive: Wallet;
    rewards: Wallet;
  };
  teamSize: {
    left: number;
    right: number;
  };
  matchedPairs: number;
  daily_income?: {
    date: string;
    amount: number;
  };
  role: 'user' | 'admin';
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
