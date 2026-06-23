"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/internal/development-log", label: "Cursor sessions", match: "cursor" },
  {
    href: "/internal/development-log/founder",
    label: "Founder journal (2025)",
    match: "founder",
  },
] as const;

export function DevelopmentLogTabs() {
  const pathname = usePathname();
  const active = pathname.includes("/founder") ? "founder" : "cursor";

  return (
    <nav
      className="mb-6 flex flex-wrap gap-2 border-b border-white/10 pb-3"
      aria-label="Development log views"
    >
      {tabs.map((tab) => {
        const isActive = tab.match === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-brand-500/20 text-brand-200"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
