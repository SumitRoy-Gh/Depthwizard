import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { BackgroundCanvas } from "@/components/three/BackgroundCanvas";
import { ThemeShell } from "@/components/shared/ThemeShell";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

export const metadata: Metadata = {
  title: {
    default: "DepthWizard — From one image, a 3D world.",
    template: "%s · DepthWizard",
  },
  description:
    "Turn a single overhead image into a labeled elevation product and an interactive 3D flythrough — metric or relative, always honest.",
  applicationName: "DepthWizard",
  authors: [{ name: "DepthWizard" }],
  keywords: [
    "DepthWizard",
    "single-view height estimation",
    "elevation model",
    "3D flythrough",
    "aerial imagery",
    "DSM",
    "disaster management",
    "single-view depth",
  ],
  openGraph: {
    title: "DepthWizard — From one image, a 3D world.",
    description:
      "Turn a single overhead image into a labeled elevation product and an interactive 3D flythrough.",
    type: "website",
    siteName: "DepthWizard",
  },
  twitter: {
    card: "summary_large_image",
    title: "DepthWizard — From one image, a 3D world.",
    description:
      "Turn a single overhead image into a labeled elevation product and an interactive 3D flythrough.",
  },
};

export const viewport: Viewport = {
  themeColor: "#F5F3ED",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Pre-paint theme: light on the landing route (no dark flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(['/','/history','/about','/settings'].includes(location.pathname))document.documentElement.classList.add('theme-light')}catch(e){}",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="relative min-h-screen antialiased">
        <BackgroundCanvas />
        <Providers>
          <ThemeShell>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </ThemeShell>
        </Providers>
      </body>
    </html>
  );
}