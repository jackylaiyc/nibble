"use client";

import { forwardRef } from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  required?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, required, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-base font-bold text-text-primary">
            {label}
            {required && <span className="text-danger ml-0.5">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          className={`w-full px-4 py-3 rounded-xl bg-primary-light text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none ${className}`}
          rows={4}
          {...props}
        />
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
