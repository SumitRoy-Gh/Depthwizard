"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Route-scoped theming: the landing route ("/") plus the informational app
 * pages ("/history", "/about", "/settings") render in the light minimal theme;
 * the processing and results pages stay dark cinematic where the 3D work
 * happens. Toggles `.theme-light` on <html>, which re-maps the CSS-variable
 * tokens in globals.css.
 *
 * layout.tsx also inlines a tiny pre-paint script that sets the same class
 * from location.pathname, so there is no dark-flash on first load.
 */
const LIGHT_ROUTES = ["/", "/history", "/about", "/settings"];

export function ThemeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const light = LIGHT_ROUTES.includes(pathname);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-light", light);
  }, [light]);

  return (
    <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
  );
}