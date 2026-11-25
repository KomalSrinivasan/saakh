import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Devanagari } from "next/font/google";
import { Shell } from "@/components/shell";
import { UiProvider } from "@/components/ui-provider";
import { SwRegister } from "./sw-register";
import "./globals.css";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const plexDeva = IBM_Plex_Sans_Devanagari({ variable: "--font-plex-deva", subsets: ["devanagari"], weight: ["400", "500", "600", "700"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["500"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Saakh", template: "%s · Saakh" },
  description: "KCC appraisal assistant for cooperative bank loan officers",
  applicationName: "Saakh",
  appleWebApp: { capable: true, title: "Saakh", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0e4d3a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" translate="no" className={`${plex.variable} ${plexDeva.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <UiProvider>
          <Shell>{children}</Shell>
        </UiProvider>
        <SwRegister />
      </body>
    </html>
  );
}
