import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CloudSnow,
  Globe2,
  Mountain,
} from "lucide-react";

// The four member web tools — single source for the member hub, the landing
// "in your browser" section, and anywhere else the tool grid appears.
export const WEB_TOOLS = [
  {
    href: "/calculator",
    name: "Stance calculator",
    description:
      "Stance width, binding angles, board length and highback lean — the app's exact engine.",
    icon: Calculator,
    accent: "text-brand-400",
  },
  {
    href: "/snow-forecast",
    name: "Snow forecast",
    description:
      "16-day multi-model snowfall for 3,466 resorts, per elevation band with time-of-day detail.",
    icon: CloudSnow,
    accent: "text-sky-400",
  },
  {
    href: "/snow-outlook",
    name: "Seasonal outlook",
    description:
      "World map of the winter ahead — validated ENSO signals north, live season status south.",
    icon: Globe2,
    accent: "text-purple-400",
  },
  {
    href: "/resort-3d",
    name: "3D resort maps",
    description:
      "Fly over any resort in LiDAR-grade 3D terrain with runs, lifts and a cinematic intro.",
    icon: Mountain,
    accent: "text-emerald-400",
  },
] as const;

export function WebToolCards() {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {WEB_TOOLS.map((tool) => (
        <Link
          key={tool.href}
          href={tool.href}
          className="glass rounded-2xl p-6 border border-transparent hover:border-brand-500/50 transition-all group"
        >
          <tool.icon className={`w-7 h-7 mb-3 ${tool.accent}`} />
          <p className="text-lg font-semibold text-white flex items-center gap-2">
            {tool.name}
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
          </p>
          <p className="text-sm text-slate-400 mt-1.5">{tool.description}</p>
        </Link>
      ))}
    </div>
  );
}
