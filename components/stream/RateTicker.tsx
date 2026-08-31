'use client';

import { useEffect, useRef, useState } from 'react';
import { fromStroops } from '@/lib/format';

interface RateTickerProps {
  /** Rate in stroops per second */
  ratePerSecond: bigint;
  /** Current withdrawable balance in stroops (fetched from contract) */
  startBalance: bigint;
  /** Decimal places to display (default: 7 for XLM) */
  decimals?: number;
  /** Unix timestamp when the stream ends (0 = open-ended). Ticker freezes past this. */
  endTime?: number;
}

/**
 * Live-updating balance counter.
 * Increments every 100ms based on ratePerSecond without any contract calls.
 * Freezes at endTime so the ticker doesn't overshoot the contract balance (#398).
 */
export function RateTicker({ ratePerSecond, startBalance, decimals = 7, endTime = 0 }: RateTickerProps) {
  const startRef  = useRef<{ ts: number; balance: bigint }>({
    ts:      Date.now(),
    balance: startBalance,
  });

  const [display, setDisplay] = useState(fromStroops(startBalance, decimals));

  useEffect(() => {
    startRef.current = { ts: Date.now(), balance: startBalance };
  }, [startBalance]);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsedMs = Date.now() - startRef.current.ts;
      let elapsedSec = BigInt(Math.floor(elapsedMs / 1000));

      if (endTime > 0) {
        const endMs = endTime * 1000;
        const remainingMs = endMs - startRef.current.ts;
        const remainingSec = BigInt(Math.max(0, Math.floor(remainingMs / 1000)));
        if (elapsedSec > remainingSec) elapsedSec = remainingSec;
      }

      if (elapsedSec < 0n) elapsedSec = 0n;

      const current = startRef.current.balance + elapsedSec * ratePerSecond;
      setDisplay(fromStroops(current, decimals));
    }, 100);
    return () => clearInterval(id);
  }, [ratePerSecond, decimals, endTime]);

  return (
    <span className="amount" aria-live="polite" aria-atomic="true">
      {display}
    </span>
  );
}
