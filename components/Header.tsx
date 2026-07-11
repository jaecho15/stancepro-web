"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BrandLogo } from "@/components/BrandLogo";
import { HeaderAuthButton } from "@/components/auth/HeaderAuthButton";
import { useSignedIn } from "@/components/auth/useSignedIn";

// Marketing nav for visitors; the member tools take over once signed in
// (Home is the hub). `wide: false` links hide below lg to keep the bar tidy.
const PUBLIC_LINKS = [
  { href: "/features", label: "Features", wide: false },
  { href: "/download", label: "Download", wide: false },
  { href: "/support", label: "Support", wide: false },
];

const MEMBER_LINKS = [
  { href: "/home", label: "Home", wide: false },
  { href: "/calculator", label: "Calculator", wide: false },
  { href: "/snow-forecast", label: "Forecast", wide: false },
  { href: "/snow-outlook", label: "Outlook", wide: true },
  { href: "/resort-3d", label: "3D Maps", wide: true },
];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const signedIn = useSignedIn();
  const navLinks = signedIn ? MEMBER_LINKS : PUBLIC_LINKS;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 glass transition-all">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center">
              <BrandLogo iconSize={32} wordmarkWidth={234} />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-slate-300 hover:text-white transition-colors ${
                    link.wide ? "hidden lg:block" : ""
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <HeaderAuthButton />
              <Link
                href="/download"
                className="px-5 py-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white font-medium hover:from-brand-400 hover:to-brand-500 transition-all"
              >
                Get the App
              </Link>
            </nav>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden glass border-t border-white/10"
            >
              <nav className="container mx-auto px-6 py-4 flex flex-col gap-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-slate-300 hover:text-white transition-colors py-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/download"
                  className="px-5 py-3 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white font-medium text-center"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Get the App
                </Link>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
