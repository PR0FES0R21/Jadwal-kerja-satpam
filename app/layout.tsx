import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jaga — Kalender Kerja",
  description: "Kalender shift security, tukar jaga dua arah dengan FIFO, dan catatan lembur.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
