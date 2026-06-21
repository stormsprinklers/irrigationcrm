import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import Providers from "@/components/providers/SessionProvider";
import { stormBrand } from "@/lib/branding";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Storm Sprinklers CRM",
  description: "Irrigation company CRM",
  icons: {
    icon: stormBrand.iconPath,
  },
};

export const viewport = {
  themeColor: stormBrand.navy,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
