'use client';

import { useState, useCallback } from 'react';
import type { OCRResult } from '@/types';

interface UseOCRReturn {
  result: OCRResult | null;
  isProcessing: boolean;
  error: string | null;
  processImage: (file: File) => Promise<OCRResult | null>;
  reset: () => void;
}

export function useOCR(): UseOCRReturn {
  const [result, setResult] = useState<OCRResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processImage = useCallback(async (file: File): Promise<OCRResult | null> => {
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to process image');
      }

      const ocrResult: OCRResult = await response.json();
      setResult(ocrResult);
      return ocrResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process image';
      setError(message);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setIsProcessing(false);
    setError(null);
  }, []);

  return {
    result,
    isProcessing,
    error,
    processImage,
    reset,
  };
}
