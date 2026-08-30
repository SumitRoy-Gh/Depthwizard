"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Studio" },
  { href: "/history", label: "History" },
  { href: "/about", label: "About" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-void via-void/85 to-void/0 backdrop-blur-md" />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <LogoMark />
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-primary">
              DepthWizard
            </span>
            <span className="mt-0.5 font-mono text-2xs uppercase tracking-[0.18em] text-faint">
              SIH 175 · v0.1
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  active ? "text-primary" : "text-muted hover:text-primary"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-elevated ring-1 ring-white/10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/5 bg-elevated/70 px-3 py-1.5 font-mono text-2xs uppercase tracking-[0.16em] text-muted lg:flex">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald" />
            </span>
            Models online
          </div>
          <Link
            href="/"
            className="group relative overflow-hidden rounded-full border border-cyan/30 bg-cyan/10 px-4 py-1.5 text-sm font-medium text-cyan transition-all hover:bg-cyan/20 hover:shadow-glow"
          >
            <span className="relative z-10">Launch Studio</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function LogoMark() {
  return (
    <div className="relative h-9 w-9">
      <svg viewBox="0 0 36 36" className="h-9 w-9">
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="50%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
          <radialGradient id="logoCore" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#67E8F9" />
            <stop offset="100%" stopColor="#0891B2" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="18" cy="18" r="17" fill="none" stroke="url(#logoGrad)" strokeWidth="1.2" />
        <circle cx="18" cy="18" r="13" fill="none" stroke="rgba(34,211,238,0.4)" strokeWidth="0.6" strokeDasharray="2 3" />
        <circle cx="18" cy="18" r="8" fill="none" stroke="rgba(16,185,129,0.5)" strokeWidth="0.6" />
        <circle cx="18" cy="18" r="4" fill="url(#logoCore)" />
        <circle cx="18" cy="18" r="2" fill="#fff" />
      </svg>
      <div className="absolute -inset-1 -z-10 rounded-full bg-cyan/20 blur-md opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}