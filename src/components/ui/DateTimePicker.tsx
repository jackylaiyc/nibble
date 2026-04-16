"use client";

import { Calendar } from "lucide-react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
}

export function DateTimePicker({ value, onChange, label, required }: DateTimePickerProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-base font-bold text-text-primary">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 pr-12 rounded-xl bg-primary-light text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        />
        <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary pointer-events-none" />
      </div>
    </div>
  );
}
