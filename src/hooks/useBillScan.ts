'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiscountType } from '@/types';

const COOLDOWN_MS = 6_000;

export interface ExtractedBill {
  items: Array<{ name: string; price: number; quantity: number }>;
  tax_amount: number;
  service_amount: number;
  // Optional: older responses (or a cached client) may not include them.
  discount_type?: DiscountType;
  discount_value?: number;
}

interface UseBillScanReturn {
  scan: (file: File) => Promise<ExtractedBill | null>;
  isScanning: boolean;
  error: string | null;
  cooldownRemaining: number;
  isCoolingDown: boolean;
  reset: () => void;
}

export function useBillScan(): UseBillScanReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback(() => {
    setCooldownRemaining(Math.ceil(COOLDOWN_MS / 1000));
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldownRemaining((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          cooldownTimer.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const scan = useCallback(
    async (file: File): Promise<ExtractedBill | null> => {
      setIsScanning(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch('/api/ocr', { method: 'POST', body: formData });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to scan (${res.status})`);
        }
        return (await res.json()) as ExtractedBill;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to scan image');
        return null;
      } finally {
        setIsScanning(false);
        startCooldown();
      }
    },
    [startCooldown]
  );

  const reset = useCallback(() => setError(null), []);

  return {
    scan,
    isScanning,
    error,
    cooldownRemaining,
    isCoolingDown: cooldownRemaining > 0,
    reset,
  };
}
