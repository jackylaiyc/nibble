"use client";

import { useEffect } from "react";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm z-10">
        {children}
      </div>
    </div>
  );
}

interface SuccessModalProps {
  open: boolean;
  message: string;
  primaryAction: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

export function SuccessModal({ open, message, primaryAction, secondaryAction }: SuccessModalProps) {
  return (
    <Modal open={open} onClose={primaryAction.onClick}>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 12l2 2 4-4" stroke="#5CBDB3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="12" r="10" stroke="#5CBDB3" strokeWidth="2"/>
          </svg>
        </div>
        <p className="text-lg font-bold text-text-primary mb-6">{message}</p>
        <div className="flex gap-3 w-full">
          {secondaryAction && (
            <Button variant="outline" fullWidth onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          <Button variant="primary" fullWidth onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
