'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet }         from '@/contexts/WalletContext';
import { CopyAddress }       from '@/components/ui/CopyAddress';
import { LogOut }            from 'lucide-react';
import { MultiWalletModal }  from '@/components/MultiWalletModal';

const CONNECT_UI_TIMEOUT_MS = 20_000;

// Auto-reconnect: cache last connected provider in localStorage with expiry (#736).
const RECONNECT_KEY = 'streamfi_last_wallet';
const RECONNECT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheWalletProvider(providerId: string) {
  try {
    localStorage.setItem(RECONNECT_KEY, JSON.stringify({
      providerId,
      expires: Date.now() + RECONNECT_EXPIRY_MS,
    }));
  } catch { /* ignore storage errors */ }
}

function getCachedWalletProvider(): string | null {
  try {
    const raw = localStorage.getItem(RECONNECT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() > data.expires) {
      localStorage.removeItem(RECONNECT_KEY);
      return null;
    }
    return data.providerId;
  } catch { return null; }
}

function clearCachedWalletProvider() {
  try {
    localStorage.removeItem(RECONNECT_KEY);
  } catch { /* ignore */ }
}

export function ConnectButton() {
  const { connected, connecting, publicKey, walletName, connect, disconnect } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const connectStartRef = useRef<number>(0);

  // Auto-reconnect on mount if a cached wallet exists (#736).
  useEffect(() => {
    if (connected) return;
    const cached = getCachedWalletProvider();
    if (!cached) return;
    // Attempt silent reconnection
    connect().catch(() => {
      // Silent reconnect failed — user needs to connect manually
      clearCachedWalletProvider();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: if connecting stays true beyond the expected timeout window,
  // force-clear the UI state so the user isn't stuck with a spinner.
  useEffect(() => {
    if (!connecting) return;
    const elapsed = Date.now() - connectStartRef.current;
    const remaining = CONNECT_UI_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      setError('Connection timed out. Please try again.');
      return;
    }
    const timer = setTimeout(() => {
      setError('Connection timed out. Please try again.');
    }, remaining);
    return () => clearTimeout(timer);
  }, [connecting]);

  const handleConnect = async () => {
    setError(null);
    connectStartRef.current = Date.now();
    try {
      await connect();
      cacheWalletProvider(walletName || 'freighter');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect wallet.');
    }
  };

  const handleModalConnect = async (providerId: string) => {
    setShowModal(false);
    setError(null);
    connectStartRef.current = Date.now();
    try {
      await connect();
      cacheWalletProvider(providerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to connect ${providerId}.`);
    }
  };

  const handleDisconnect = () => {
    clearCachedWalletProvider();
    disconnect();
  };

  if (connecting) {
    return (
      <button disabled aria-busy="true" className="btn-secondary text-xs opacity-60">
        Connecting…
      </button>
    );
  }

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden sm:block text-xs text-gray-500 dark:text-gray-400">
          <CopyAddress address={publicKey} />
        </span>
        <button
          onClick={handleDisconnect}
          className="btn-secondary text-xs"
          title={`Disconnect ${walletName}`}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Disconnect</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={() => setShowModal(true)} className="btn-secondary text-xs">
        Connect wallet
      </button>
      {error && (
        <p role="alert" aria-live="polite" className="text-xs text-red-600 max-w-[16rem] text-right">
          {error}
        </p>
      )}
      <MultiWalletModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onConnect={handleModalConnect}
      />
    </div>
  );
}
