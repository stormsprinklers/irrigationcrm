import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Providers from "@/components/providers/SessionProvider";
import { stormBrand } from "@/lib/branding";
import { RADAR_APP_NAME, getRadarDocumentTitle } from "@/lib/radar-title";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export async function generateMetadata(): Promise<Metadata> {
  const title = await getRadarDocumentTitle();
  return {
    title,
    description:
      "Internal irrigation company operations and marketing platform for Storm Sprinklers.",
    applicationName: RADAR_APP_NAME,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: RADAR_APP_NAME,
      statusBarStyle: "default",
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/icon.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      shortcut: "/icon.png",
      other: [
        {
          rel: "apple-touch-icon",
          url: "/apple-icon.png",
          sizes: "180x180",
        },
      ],
    },
    other: {
      "mobile-web-app-capable": "yes",
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-title": RADAR_APP_NAME,
      "apple-mobile-web-app-status-bar-style": "default",
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
        noarchive: true,
        nosnippet: true,
      },
    },
  };
}

export const viewport: Viewport = {
  themeColor: stormBrand.navy,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
