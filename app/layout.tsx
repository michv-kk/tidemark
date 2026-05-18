import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AlertsProvider } from "@/contexts/AlertsContext";
import Navbar from "@/components/Navbar";
import TickerBar from "@/components/TickerBar";
import AlertsSystem from "@/components/AlertsSystem";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "TIDEMARK — Crypto Whale Tracker",
  description: "Real-time blockchain whale activity monitor. Track large transactions, analyze wallets, and monitor market movements.",
  keywords: ["crypto", "whale tracker", "blockchain", "ethereum", "bitcoin", "DeFi"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#080d18] text-[#e8eaf0]`}>
        <SettingsProvider>
          <AlertsProvider>
            <TickerBar />
            <Navbar />
            <main className="min-h-screen">
              {children}
            </main>
            <AlertsSystem />
          </AlertsProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
