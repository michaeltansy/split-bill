'use client';

import { useState, useCallback, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Participant } from '@/types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  participants: Participant[];
}

export function ShareModal({
  isOpen,
  onClose,
  sessionId,
  participants,
}: ShareModalProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'link' | 'qr' | 'participants'>('link');
  const [canShare, setCanShare] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = `${baseUrl}/session/${sessionId}`;

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && !!navigator.share);
  }, []);

  const handleCopy = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;

    try {
      await navigator.share({
        title: 'Split Bill Session',
        text: 'Join my bill splitting session!',
        url: shareUrl,
      });
    } catch (err) {
      // User cancelled or share failed
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  }, [shareUrl]);

  const getParticipantUrl = (name: string) => {
    return `${shareUrl}?participant=${encodeURIComponent(name)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Share Session</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 py-3 text-sm font-medium ${
              activeTab === 'link'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Link
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-3 text-sm font-medium ${
              activeTab === 'qr'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            QR Code
          </button>
          {participants.length > 0 && (
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex-1 py-3 text-sm font-medium ${
                activeTab === 'participants'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Participants
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {activeTab === 'link' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Share this link with anyone to let them view and edit the session.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 text-sm"
                />
                <button
                  onClick={() => handleCopy(shareUrl, 'main')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                >
                  {copied === 'main' ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {canShare && (
                <button
                  onClick={handleNativeShare}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share via...
                </button>
              )}
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="flex flex-col items-center space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Scan this QR code to open the session on another device.
              </p>

              <div className="p-4 bg-white border rounded-lg">
                <QRCodeSVG
                  value={shareUrl}
                  size={200}
                  level="M"
                  includeMargin
                />
              </div>

              <button
                onClick={() => handleCopy(shareUrl, 'qr')}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {copied === 'qr' ? 'Link copied!' : 'Copy link instead'}
              </button>
            </div>
          )}

          {activeTab === 'participants' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Share individual links with each participant so they can view their personal bill and claim items.
              </p>

              <div className="space-y-3">
                {participants.map((p) => {
                  const url = getParticipantUrl(p.name);
                  const copyId = `participant-${p.id}`;

                  return (
                    <div key={p.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{p.name}</span>
                        <button
                          onClick={() => handleCopy(url, copyId)}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          {copied === copyId ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={url}
                        readOnly
                        className="w-full px-2 py-1 bg-gray-50 border rounded text-xs text-gray-600"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
