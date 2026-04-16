"use client";

interface Chip {
  key: string;
  label: string;
}

interface ChipGroupProps {
  chips: Chip[];
  selected: string | string[];
  onChange: (key: string) => void;
  multiple?: boolean;
}

export function ChipGroup({ chips, selected, onChange }: ChipGroupProps) {
  const isSelected = (key: string) =>
    Array.isArray(selected) ? selected.includes(key) : selected === key;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={() => onChange(chip.key)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
            isSelected(chip.key)
              ? "bg-primary text-white"
              : "bg-surface text-text-secondary border border-gray-200 hover:border-primary"
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
