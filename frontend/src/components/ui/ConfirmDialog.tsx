"use client";

import { useEffect } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  progress?: number | null;   // 0-100: replaces the buttons with a progress bar while working
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app replacement for window.confirm, with an optional progress bar for long actions. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  progress = null,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-gray-100 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <h3 id="confirm-title" className="text-base font-bold text-black">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>

        {error && (
          <p className="text-xs rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{error}</p>
        )}

        {progress !== null ? (
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-black transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs font-mono text-gray-500 text-right">{progress}%</p>
          </div>
        ) : (
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              autoFocus
              className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 ${
                danger ? "bg-red-600 hover:bg-red-700" : "bg-black hover:bg-zinc-800"
              }`}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
