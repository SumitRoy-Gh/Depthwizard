import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/5 bg-gradient-to-b from-transparent to-void/80">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-sm font-medium text-primary">DepthWizard</p>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Single-view monocular height estimation and 3D flythrough. A research
            demo built for the SIH 175 hackathon.
          </p>
        </div>
        <div>
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">
            Datasets
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>ISPRS Vaihingen</li>
            <li>ISPRS Potsdam</li>
            <li>DFC2019</li>
          </ul>
        </div>
        <div>
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">
            Stack
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>Depth Anything v2</li>
            <li>Correction U-Net</li>
            <li>Three.js · MapLibre</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-white/5 px-6 py-4 text-2xs text-faint md:flex-row md:items-center md:justify-between">
        <span className="font-mono uppercase tracking-[0.16em]">
          © SIH 175 · Built for hackathon demo · 2026
        </span>
        <Link href="/about" className="hover:text-primary">
          Read the technical notes →
        </Link>
      </div>
    </footer>
  );
}