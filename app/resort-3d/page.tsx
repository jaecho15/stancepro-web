import type { Metadata } from "next";
import Link from "next/link";
import { fetchResortIndex } from "@/lib/snow/fetch";
import { ShowcaseViewer, type FeaturedResort } from "@/components/resort3d/ShowcaseViewer";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "3D Resort Terrain - Interactive Ski Resort Maps | StancePro",
  description:
    "Explore ski resorts in interactive 3D: LiDAR 5-metre terrain, runs, lifts and off-piste context — the same engine as the StancePro app, right in your browser.",
  alternates: { canonical: "/resort-3d" },
  openGraph: {
    title: "3D Resort Terrain | StancePro",
    description: "Interactive 3D ski resort terrain with LiDAR 5 m detail.",
    url: "https://stance-pro.com/resort-3d",
  },
};

// Featured resorts — all verified to have full LiDAR (5 m) terrain artifacts.
const FEATURED: FeaturedResort[] = [
  {
    id: "osm-way-771668333",
    name: "Hakuba Happo One",
    country: "JP",
    blurb: "Olympic downhill ridgelines above the Hakuba valley, in 5 m LiDAR detail.",
  },
  {
    id: "osm-relation-14756845",
    name: "Niseko United",
    country: "JP",
    blurb: "Four interlinked resorts around Mt. Niseko-Annupuri's powder bowls.",
  },
  {
    id: "osm-way-474288286",
    name: "Whistler Blackcomb",
    country: "CA",
    blurb: "North America's largest ski area — two peaks, one enormous valley.",
  },
  {
    id: "osm-way-1074335726",
    name: "Jackson Hole",
    country: "US",
    blurb: "Corbet's Couloir and 1,262 m of continuous vertical off the tram.",
  },
  {
    id: "osm-way-540681046",
    name: "Zermatt – Cervinia",
    country: "CH",
    blurb: "Cross-border glacier skiing beneath the Matterhorn.",
  },
  {
    id: "osm-way-482928468",
    name: "The Remarkables",
    country: "NZ",
    blurb: "Queenstown's jagged southern skyline, chutes included.",
  },
  {
    id: "osm-relation-19839568",
    name: "Treble Cone",
    country: "NZ",
    blurb: "Wānaka's big-mountain terrain above the lake.",
  },
];

export default async function Resort3DPage() {
  const index = await fetchResortIndex();
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <section className="relative container mx-auto px-6 pt-28 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Resorts in <span className="gradient-text">3D</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-3xl mx-auto">
              The StancePro app's 3D terrain engine, in your browser: LiDAR 5-metre
              elevation, runs, lifts and neighbouring peaks. Drag to rotate, pinch or
              scroll to zoom.
            </p>
          </div>

          <ShowcaseViewer resorts={FEATURED} index={index} />

          <p className="text-center text-sm text-slate-500 mt-8">
            Every resort in the app gets this view — plus off-piste route drawing,
            safety overlays and offline caching.{" "}
            <Link href="/download" className="text-brand-400 hover:text-brand-300">
              Get the app →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
