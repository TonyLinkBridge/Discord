import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RayNameThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RayName Admin",
  description: "RayName administration console",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <RayNameThemeProvider>{children}</RayNameThemeProvider>
      </body>
    </html>
  );
}
