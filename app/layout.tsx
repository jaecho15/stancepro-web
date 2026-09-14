import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://stance-pro.com'),
  title: "StancePro - Every moment on snow. One app.",
  description: "3D resort maps, snow forecast by hour and elevation, automatic ride tracking, AI video analysis and coaching by top-level trainers for snowboarders and skiers.",
  keywords: ["snowboard", "ski", "3D resort map", "snow forecast", "ride tracker", "AI video analysis", "snowboard coaching", "stance calculator", "snowboarding app"],
  authors: [{ name: "StancePro" }],
  openGraph: {
    title: "StancePro - Every moment on snow. One app.",
    description: "3D resort maps, snow forecast, ride tracker, AI video analysis and pro coaching for snowboarders and skiers.",
    url: "https://stance-pro.com",
    siteName: "StancePro",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "StancePro App",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StancePro - Every moment on snow. One app.",
    description: "3D resort maps, snow forecast, ride tracker, AI video analysis and pro coaching for snowboarders and skiers.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

