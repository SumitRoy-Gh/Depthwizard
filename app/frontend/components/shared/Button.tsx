"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  const variants = {
    primary: cn(
      "relative isolate overflow-hidden border border-cyan/40 bg-cyan/15 text-cyan shadow-glow",
      "hover:bg-cyan/25 hover:shadow-[0_0_32px_-4px_rgba(34,211,238,0.6)]",
      "transition-all duration-300"
    ),
    ghost: "text-muted hover:text-primary hover:bg-white/5",
    outline: "border border-white/10 bg-elevated/40 text-primary hover:border-white/20 hover:bg-elevated/70",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium",
        sizes[size],
        variants[variant],
        className
      )}
      {...(props as any)}
    >
      {variant === "primary" && (
        <span className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-cyan/0 via-white/10 to-cyan/0 opacity-0 transition-opacity duration-500 hover:opacity-100" />
      )}
      {children}
    </motion.button>
  );
}