"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Route-scoped theming: the landing route ("/") renders in the light minimal
 * theme; every other route stays dark cinematic. Toggles `.theme-light` on
 * <html>, which re-maps the CSS-variable tokens in globals.css.
 *
 * layout.tsx also inlines a tiny pre-paint script that sets the same class
 * from location.pathname, so there is no dark-flash on first load of "/".
 */
export function ThemeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const light = pathname === "/";

  useEffect(() => {
    document.documentElement.classList.toggle("theme-light", light);
  }, [light]);

  return (
    <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
  );
}