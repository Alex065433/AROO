import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, RefreshCcw } from 'lucide-react';

interface CoinRate {
  symbol: string;
  price: string;
  change: string;
  isUp: boolean;
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'TRXUSDT'];

export const LiveRatesTicker: React.FC = () => {
  const [rates, setRates] = useState<Record<string, CoinRate>>({
    BTCUSDT: { symbol: 'BTC', price: '0.00', change: '0.00', isUp: true },
    ETHUSDT: { symbol: 'ETH', price: '0.00', change: '0.00', isUp: true },
    TRXUSDT: { symbol: 'TRX', price: '0.00', change: '0.00', isUp: true },
    USDT: { symbol: 'USDT', price: '1.00', change: '0.00', isUp: true },
  });

  useEffect(() => {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws');

    ws.onopen = () => {
      ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: SYMBOLS.map(s => `${s.toLowerCase()}@ticker`),
        id: 1,
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.e === '24hrTicker') {
        const symbol = data.s;
        const price = parseFloat(data.c).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        const change = parseFloat(data.P).toFixed(2);
        const isUp = parseFloat(data.P) >= 0;

        setRates(prev => ({
          ...prev,
          [symbol]: {
            symbol: symbol.replace('USDT', ''),
            price,
            change,
            isUp,
          },
        }));
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="w-full bg-black/40 backdrop-blur-md border-y border-white/5 py-2 overflow-hidden relative">
      <div className="flex whitespace-nowrap animate-marquee hover:pause">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex gap-8 px-4 items-center min-w-full">
            {(Object.values(rates) as CoinRate[]).map((coin) => (
              <div key={`${i}-${coin.symbol}`} className="flex items-center gap-3 px-4 py-1 rounded-full bg-white/5 border border-white/10">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{coin.symbol}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium text-white">
                      ${coin.price}
                    </span>
                    <div className={`flex items-center gap-0.5 text-[10px] font-bold ${coin.isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {coin.isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {coin.change}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .pause {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};
