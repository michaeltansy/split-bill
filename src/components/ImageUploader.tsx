'use client';

import { useState, useCallback } from 'react';
import type { OCRResult } from '@/types';

interface ImageUploaderProps {
  onUpload: (file: File) => void;
  onProcessed: (result: OCRResult) => void;
  isProcessing: boolean;
}

export function ImageUploader({
  onUpload,
  onProcessed,
  isProcessing,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      onUpload(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    <div className="w-full max-w-xl mx-auto">
      {isProcessing ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Scanning your receipt...</p>
          <p className="text-sm text-gray-400 mt-2">This may take a few seconds</p>
        </div>
      ) : preview ? (
        <div className="border-2 border-gray-300 rounded-lg p-4">
          <img
            src={preview}
            alt="Receipt preview"
            className="max-h-64 mx-auto rounded"
          />
          <button
            onClick={() => setPreview(null)}
            className="mt-4 w-full py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Remove and upload different image
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <div className="text-4xl mb-4">📷</div>
            <p className="text-lg font-medium text-gray-700">
              Upload Receipt Image
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Drag & drop or click to select
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Supports: JPG, PNG, WEBP (max 10MB)
            </p>
          </label>
        </div>
      )}
    </div>
  );
}
