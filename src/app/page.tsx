'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUploader } from '@/components/ImageUploader';
import { useOCR } from '@/hooks/useOCR';
import type { OCRResult } from '@/types';

export default function Home() {
  const router = useRouter();
  const { isProcessing, error, processImage } = useOCR();
  const [isCreating, setIsCreating] = useState(false);

  const handleUpload = async (file: File) => {
    const result = await processImage(file);
    if (result) {
      await createSession(result);
    }
  };

  const createSession = async (ocrResult?: OCRResult) => {
    setIsCreating(true);
    try {
      const sessionData = ocrResult
        ? {
            subtotal: ocrResult.subtotal || 0,
            tax_amount: ocrResult.tax_amount || 0,
            service_amount: ocrResult.service_amount || 0,
            grand_total: ocrResult.grand_total || 0,
            tax_percentage: ocrResult.tax_percentage || 0,
            service_percentage: ocrResult.service_percentage || 0,
            items: ocrResult.items,
          }
        : {};

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const session = await response.json();
      router.push(`/session/${session.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      alert('Failed to create session. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartWithoutImage = () => {
    createSession();
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Split Bill</h1>
      <p className="text-gray-600 mb-8 text-center max-w-md">
        Upload a receipt image to automatically extract items, or start from scratch
      </p>

      <ImageUploader
        onUpload={handleUpload}
        onProcessed={() => {}}
        isProcessing={isProcessing || isCreating}
      />

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="mt-8">
        <button
          onClick={handleStartWithoutImage}
          disabled={isProcessing || isCreating}
          className="text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Or start without a receipt image
        </button>
      </div>

      {isCreating && (
        <p className="mt-4 text-gray-500">Creating your session...</p>
      )}
    </main>
  );
}
