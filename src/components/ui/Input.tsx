"use client";

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
  error?: string;
  charCount?: { current: number; max: number };
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, required, error, charCount, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-base font-bold text-text-primary">
            {label}
            {required && <span className="text-danger ml-0.5">*</span>}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-4 py-3 rounded-xl bg-primary-light text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${error ? "ring-2 ring-danger/30" : ""} ${className}`}
          {...props}
        />
        <div className="flex justify-between">
          {error && <p className="text-sm text-danger">{error}</p>}
          {charCount && (
            <p className="text-sm text-text-secondary ml-auto">
              {charCount.current} / {charCount.max}
            </p>
          )}
        </div>
      </div>
    );
  }
);
Input.displayName = "Input";
