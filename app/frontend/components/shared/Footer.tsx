import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer relative mt-24 border-t border-hairline">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-primary">DepthWizard</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              From a single overhead image to a labeled elevation product and an
              explorable 3D flythrough — for disaster response, urban planning
              and infrastructure monitoring.
            </p>
            <p className="mt-4 font-mono text-2xs uppercase tracking-[0.18em] text-faint">
              SIH 26175 · ISRO / Department of Space
            </p>
          </div>
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">
              Explore
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>
                <Link href="/" className="transition-colors hover:text-primary">Studio</Link>
              </li>
              <li>
                <Link href="/history" className="transition-colors hover:text-primary">History</Link>
              </li>
              <li>
                <Link href="/#features" className="transition-colors hover:text-primary">Features</Link>
              </li>
              <li>
                <Link href="/about" className="transition-colors hover:text-primary">About</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">
              Built for
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>SIH 26175 — Single-view height estimation</li>
              <li>ISRO / Department of Space</li>
              <li>Disaster management theme</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-hairline pt-5 text-2xs text-faint md:flex-row md:items-center md:justify-between">
          <span className="font-mono uppercase tracking-[0.16em]">
            © 2026 DepthWizard
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-mono uppercase tracking-[0.16em]">
              Metric or relative — always labeled
            </span>
            <Link href="/about" className="transition-colors hover:text-primary">
              Read the technical notes →
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}