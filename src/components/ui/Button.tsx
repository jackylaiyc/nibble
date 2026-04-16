"use client";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  children: React.ReactNode;
}

export function Button({ variant = "primary", size = "md", fullWidth = false, children, className = "", ...props }: ButtonProps) {
  const base = "rounded-full font-medium transition-all duration-200 flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-dark active:scale-[0.98]",
    outline: "border-2 border-primary text-primary hover:bg-primary-light",
    ghost: "text-text-secondary hover:bg-surface",
  };
  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };
  const width = fullWidth ? "w-full" : "";

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${width} ${className}`} {...props}>
      {children}
    </button>
  );
}
