import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { BackgroundCanvas } from "@/components/three/BackgroundCanvas";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

export const metadata: Metadata = {
  title: {
    default: "DepthWizard — From one image, a 3D world.",
    template: "%s · DepthWizard",
  },
  description:
    "Upload a single overhead image and get back a fully interactive 3D height model. Depth Anything v2 + correction U-Net, deployed as a cinematic experience.",
  applicationName: "DepthWizard",
  authors: [{ name: "SIH 175 Team" }],
  keywords: [
    "DepthWizard",
    "monocular depth",
    "Depth Anything v2",
    "3D flythrough",
    "aerial imagery",
    "DSM",
    "SIH 175",
    "single-view height",
  ],
  openGraph: {
    title: "DepthWizard — From one image, a 3D world.",
    description:
      "A research demo for monocular single-view height estimation with a cinematic 3D flythrough.",
    type: "website",
    siteName: "DepthWizard",
  },
  twitter: {
    card: "summary_large_image",
    title: "DepthWizard — From one image, a 3D world.",
    description:
      "A research demo for monocular single-view height estimation with a cinematic 3D flythrough.",
  },
};

export const viewport: Viewport = {
  themeColor: "#05060A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
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
          <div className="relative z-10 flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}