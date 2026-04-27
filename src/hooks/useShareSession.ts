'use client';

import { useMemo, useCallback, useState } from 'react';
import { useClipboard } from './useClipboard';

interface UseShareSessionReturn {
  shareUrl: string;
  copyShareUrl: () => Promise<boolean>;
  copied: boolean;
  canShare: boolean;
  share: () => Promise<void>;
}

export function useShareSession(sessionId: string): UseShareSessionReturn {
  const { copy, copied } = useClipboard();
  const [canShare] = useState(() => typeof navigator !== 'undefined' && !!navigator.share);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    return `${baseUrl}/session/${sessionId}`;
  }, [sessionId]);

  const copyShareUrl = useCallback(() => {
    return copy(shareUrl);
  }, [copy, shareUrl]);

  const share = useCallback(async () => {
    if (canShare) {
      await navigator.share({
        title: 'Split Bill Session',
        text: 'Join this bill splitting session',
        url: shareUrl,
      });
    } else {
      await copyShareUrl();
    }
  }, [canShare, shareUrl, copyShareUrl]);

  return {
    shareUrl,
    copyShareUrl,
    copied,
    canShare,
    share,
  };
}
