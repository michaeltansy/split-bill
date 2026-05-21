'use client';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Minimal destructive-action confirm. Backdrop + centered card, matching ShareModal.
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isProcessing = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={isProcessing ? undefined : onCancel} />

      <div
        role="alertdialog"
        aria-modal="true"
        className="relative bg-surface-card rounded-2xl shadow-xl w-full max-w-sm p-6"
      >
        <h2 className="text-lg font-semibold text-text-primary mb-2">{title}</h2>
        <p className="text-sm text-text-secondary mb-6">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-semibold text-white bg-status-danger rounded-xl hover:opacity-90 disabled:opacity-50"
          >
            {isProcessing ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
