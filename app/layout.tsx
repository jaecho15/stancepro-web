import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StancePro - The Ultimate Snowboard & Ski Stance Calculator",
  description: "Dial in your perfect stance setup with science-backed recommendations. Compare with pro riders, get video coaching, and join the community.",
  keywords: ["snowboard", "ski", "stance calculator", "binding angles", "stance width", "snowboarding app"],
  authors: [{ name: "StancePro" }],
  openGraph: {
    title: "StancePro - The Ultimate Snowboard & Ski Stance Calculator",
    description: "Dial in your perfect stance setup with science-backed recommendations.",
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
    title: "StancePro - The Ultimate Snowboard & Ski Stance Calculator",
    description: "Dial in your perfect stance setup with science-backed recommendations.",
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
        <Header />
        <main className="min-h-screen pt-16">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

