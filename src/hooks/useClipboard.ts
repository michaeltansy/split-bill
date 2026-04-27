'use client';

import { useState, useCallback } from 'react';

interface UseClipboardReturn {
  copy: (text: string) => Promise<boolean>;
  copied: boolean;
  error: Error | null;
}

export function useClipboard(resetDelay: number = 2000): UseClipboardReturn {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setError(null);

        setTimeout(() => {
          setCopied(false);
        }, resetDelay);

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to copy'));
        setCopied(false);
        return false;
      }
    },
    [resetDelay]
  );

  return { copy, copied, error };
}
