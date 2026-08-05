"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type AppModalProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  hideCancel?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
};

export function AppModal({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
  hideCancel = false,
  loading = false,
  onConfirm,
  onCancel,
}: AppModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCancel) onCancel();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="app-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!loading && onCancel) onCancel();
      }}
    >
      <div
        className="app-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="app-modal-title">{title}</h2>
        {message && <p className="muted app-modal-message">{message}</p>}
        <div className={`app-modal-actions ${hideCancel ? "single" : ""}`}>
          {!hideCancel && (
            <button type="button" className="ghost-btn" onClick={onCancel} disabled={loading}>
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={danger ? "ghost-btn danger" : "primary-btn"}
            onClick={() => void onConfirm()}
            disabled={loading}
          >
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
