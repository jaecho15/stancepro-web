"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  Calculator,
  Users,
  Video,
  Mountain,
  Target,
  TrendingUp,
  Ruler,
  Compass,
  Sliders,
  MessageCircle,
  BookOpen,
  Award,
  Zap,
  CloudSnow,
  Globe2,
  Thermometer,
  Satellite,
  Map,
  Route,
  Gauge,
  ArrowRight
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppStoreButtons } from "@/components/AppStoreButtons";

interface Feature {
  id: string;
  stage: string; // where it sits in a season: Setup · Plan · Ride · Replay · Coach · Progress
  title: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
  webHref?: string; // set when the feature also runs on the web
  shot?: { src: string; alt: string }; // app screenshot; falls back to the icon tile
  details: { icon: LucideIcon; text: string }[];
}

const SHOTS = "/screenshots/app";

// Ordered the way a season happens, matching the ad: set up, plan the day,
// ride it, replay it, get coached on it, watch the skills fill in.
const features: Feature[] = [
  {
    id: "calculator",
    stage: "Setup",
    title: "A Stance Calculated From Your Body",
    description: "Snowboard or ski, your measurements, riding style and terrain go in; stance width, angles, setback and sizing come out, drawn on the board.",
    icon: Calculator,
    gradient: "from-orange-500 to-red-500",
    webHref: "/calculator",
    shot: { src: `${SHOTS}/setup-stance-gear.webp`, alt: "StancePro stance setup with binding angles and width drawn on a snowboard, plus saved gear" },
    details: [
      { icon: Ruler, text: "Stance width and sizing from your own measurements" },
      { icon: Compass, text: "Snowboard angles, setback, and ski setup recommendations" },
      { icon: Sliders, text: "Saved setups you can revisit, edit, and compare" },
      { icon: Target, text: "QR share and import for a quick handoff at the shop" },
    ]
  },
  {
    id: "equipment",
    stage: "Setup",
    title: "Gear Suitability Analysis",
    description: "Your board, boots and bindings checked as one package against your stance and riding style: overall grade, per-item grades, and what to watch.",
    icon: Target,
    gradient: "from-purple-500 to-pink-500",
    shot: { src: `${SHOTS}/setup-gear-suitability.webp`, alt: "StancePro gear suitability analysis with grades for board, boots and bindings" },
    details: [
      { icon: Sliders, text: "Board, boots and bindings graded together and separately" },
      { icon: Target, text: "Flex, size and style interactions explained in plain words" },
      { icon: TrendingUp, text: "Compare options side by side before deciding" },
      { icon: BookOpen, text: "Build setups around the gear you already own" },
    ]
  },
  {
    id: "snow-forecast",
    stage: "Plan",
    title: "Tomorrow's Snow, Known Today",
    description: "Multi-model snowfall forecasts for 3,400+ resorts worldwide, resolved per elevation band so you know what's falling at the base, mid-mountain, and the summit.",
    icon: CloudSnow,
    gradient: "from-sky-500 to-blue-600",
    webHref: "/snow-forecast",
    shot: { src: `${SHOTS}/plan-snow-forecast.webp`, alt: "StancePro snow forecast for a resort by day, hour and elevation band" },
    details: [
      { icon: CloudSnow, text: "Four-model ensemble with honest uncertainty ranges, 16 days out" },
      { icon: Mountain, text: "Base, mid and top elevation bands forecast separately" },
      { icon: Thermometer, text: "Time-of-day detail with rain risk and freezing level" },
      { icon: TrendingUp, text: "Weeks 3–6 tendency from a 51-member ensemble" },
    ]
  },
  {
    id: "snow-outlook",
    stage: "Plan",
    title: "Seasonal Snow Outlook",
    description: "A world map of the winter ahead: probabilistic outlooks only where they're validated against 40+ years of winters, and live observed season status for the southern hemisphere.",
    icon: Globe2,
    gradient: "from-indigo-500 to-purple-600",
    webHref: "/snow-forecast",
    details: [
      { icon: Globe2, text: "World map of every covered climate region at a glance" },
      { icon: TrendingUp, text: "Validated ENSO signals with tercile probabilities — no guesswork" },
      { icon: Satellite, text: "Southern winters tracked live: percentile, snowfall and satellite cover" },
      { icon: BookOpen, text: "Analog winters show you the seasons that looked like this one" },
    ]
  },
  {
    id: "resort-3d",
    stage: "Plan",
    title: "3,400+ Resorts in Full 3D",
    description: "Fly the mountain before you ride it: LiDAR-grade 5-metre terrain with runs, lifts, slope angle and off-piste context, and your own tracks drawn on real relief.",
    icon: Map,
    gradient: "from-emerald-500 to-teal-600",
    webHref: "/resort-3d",
    shot: { src: `${SHOTS}/replay-3d-map.webp`, alt: "StancePro 3D resort map with a session track drawn on LiDAR terrain" },
    details: [
      { icon: Mountain, text: "LiDAR 5 m terrain where available, worldwide coverage everywhere" },
      { icon: Route, text: "Runs, lifts, slope angle and off-piste context draped over real relief" },
      { icon: Video, text: "Cinematic entry sweep that lands on the trail-map view" },
      { icon: Zap, text: "Frozen alpine tarns flagged with thin-ice caution" },
    ]
  },
  {
    id: "ride-tracker",
    stage: "Ride",
    title: "Every Run, Auto-Tracked",
    description: "Start a session and put the phone away. Lifts, runs, jumps and turns are detected on their own, and the day comes back as numbers, a map, and a 3D replay.",
    icon: Gauge,
    gradient: "from-rose-500 to-orange-500",
    shot: { src: `${SHOTS}/ride-tracker-session.webp`, alt: "StancePro ride tracker session stats: max speed, vertical, distance, jumps and turns" },
    details: [
      { icon: Gauge, text: "Speed, vertical, distance, turns and calories per session" },
      { icon: TrendingUp, text: "Automatic lift and gondola detection on the mountain" },
      { icon: Zap, text: "Jump airtime, spins and landing stability metrics" },
      { icon: Map, text: "Session map and 3D replay you can revisit anytime" },
    ]
  },
  {
    id: "ai-analysis",
    stage: "Replay",
    title: "Upload a Clip, AI Breaks It Down",
    description: "AI reads your run frame by frame: turns are detected, a skeleton is drawn over you, and every note points at the motion that caused it.",
    icon: Video,
    gradient: "from-brand-500 to-cyan-500",
    shot: { src: `${SHOTS}/coach-ai-analysis.webp`, alt: "StancePro session details with AI analysis feedback and a request for human coaching" },
    details: [
      { icon: Video, text: "Skeleton overlay and turn detection on your own clip" },
      { icon: Gauge, text: "Turn metrics: edge change timing, stance, angulation" },
      { icon: BookOpen, text: "Strengths and points to improve, backed by motion evidence" },
      { icon: Users, text: "One tap to send the same clip to a human coach" },
    ]
  },
  {
    id: "digital-rider",
    stage: "Replay",
    title: "Your Ride, Rebuilt in 3D",
    description: "Digital Rider turns phone video into a full 3D rider you can orbit and slow down, joint by joint.",
    icon: Zap,
    gradient: "from-cyan-500 to-blue-600",
    details: [
      { icon: Video, text: "From a single phone clip to a 3D avatar replay" },
      { icon: Compass, text: "Any angle, any speed" },
      { icon: Sliders, text: "Joint-level motion for the moments that matter" },
      { icon: Zap, text: "Built on the same pose data as the AI analysis" },
    ]
  },
  {
    id: "coaching",
    stage: "Coach",
    title: "Coaching by Top-Level Trainers",
    description: "Certified coaches review your clip online and hand back frame-by-frame drawings with voice feedback. AI does the analysis; a person does the coaching.",
    icon: Users,
    gradient: "from-amber-500 to-orange-500",
    shot: { src: "/screenshots/coach/coach-review-tools.webp", alt: "StancePro coach feedback tools: drawing and voice annotation on a rider's clip" },
    details: [
      { icon: MessageCircle, text: "Frame-by-frame drawings and voice notes on your clip" },
      { icon: Award, text: "Coaches are certified and verified before they can take requests" },
      { icon: Users, text: "Pick a coach directly, or let the first available one take it" },
      { icon: Globe2, text: "Feedback translated into the app's languages" },
    ]
  },
  {
    id: "pro-riders",
    stage: "Progress",
    title: "Rider Setup Inspiration",
    description: "Explore published rider profiles and compare setup references inside the app without losing sight of your own saved setup.",
    icon: Users,
    gradient: "from-green-500 to-emerald-500",
    details: [
      { icon: Award, text: "Browse rider profiles already in the app database" },
      { icon: Target, text: "Compare stance widths and angles to your own" },
      { icon: TrendingUp, text: "Use style tags and references for setup ideas" },
      { icon: BookOpen, text: "Save useful comparisons alongside your own setups" },
    ]
  },
  {
    id: "tracking",
    stage: "Progress",
    title: "Watch Yourself Level Up",
    description: "A skill tree fills in as coaches sign off on what you've landed, and the season's sessions add up on one home screen.",
    icon: TrendingUp,
    gradient: "from-blue-500 to-indigo-500",
    shot: { src: `${SHOTS}/progress-home.webp`, alt: "StancePro home screen with skill progress, snow forecast and ride tracker cards" },
    details: [
      { icon: TrendingUp, text: "Skill progression across the season, with the next skill up" },
      { icon: BookOpen, text: "Saved stance and gear setups tied to your account" },
      { icon: Gauge, text: "Season stats from every tracked session" },
      { icon: Sliders, text: "Coaching hub for riders and coaches in one place" },
    ]
  },
  {
    id: "community",
    stage: "Progress",
    title: "Friends on the Mountain",
    description: "Meet up with friends on the hill, share your location while you ride together, and keep the conversation going in messages.",
    icon: Mountain,
    gradient: "from-blue-500 to-indigo-500",
    details: [
      { icon: Users, text: "Meetups with live location on the map" },
      { icon: MessageCircle, text: "Direct messaging with friends" },
      { icon: Video, text: "Training media with technique-focused content" },
      { icon: Award, text: "Events and community browsing tools" },
    ]
  },
];

export default function FeaturesPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      {/* Hero Section */}
      <section className="relative container mx-auto px-6 pt-20 pb-16">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1 
            className="text-4xl md:text-6xl font-bold mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Plan it. Ride it. Replay it.
            <span className="gradient-text block">Get coached on it.</span>
          </motion.h1>
          <motion.p 
            className="text-xl text-slate-400 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Every StancePro feature, in the order a season happens.
          </motion.p>
        </div>
      </section>

      {/* Features List */}
      <section className="relative container mx-auto px-6 py-16">
        <div className="space-y-24">
          {features.map((feature, index) => (
            <motion.div
              key={feature.id}
              id={feature.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-12`}
            >
              {/* Screenshot where we have one, icon tile otherwise */}
              <div className="flex-1 flex justify-center">
                {feature.shot ? (
                  <div className="relative w-[220px] sm:w-[240px] aspect-[1080/2424] rounded-[2rem] bg-mountain-950 ring-1 ring-white/10 shadow-2xl overflow-hidden">
                    <Image
                      src={feature.shot.src}
                      alt={feature.shot.alt}
                      fill
                      sizes="240px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className={`w-64 h-64 rounded-3xl bg-gradient-to-br ${feature.gradient} p-1`}>
                    <div className="w-full h-full rounded-3xl bg-mountain-900 flex items-center justify-center">
                      <feature.icon className="w-24 h-24 text-white/80" />
                    </div>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">{feature.stage}</p>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">{feature.title}</h2>
                <p className="text-xl text-slate-400 mb-8">{feature.description}</p>
                
                <div className="grid sm:grid-cols-2 gap-4">
                  {feature.details.map((detail, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center flex-shrink-0`}>
                        <detail.icon className="w-5 h-5 text-white" />
                      </div>
                      <p className="text-slate-300 pt-2">{detail.text}</p>
                    </div>
                  ))}
                </div>

                {feature.webHref && (
                  <Link
                    href={feature.webHref}
                    className="inline-flex items-center gap-2 mt-8 px-5 py-2.5 rounded-full border border-brand-500/50 text-brand-300 hover:bg-brand-500/10 transition-all font-medium"
                  >
                    Try it in your browser <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative container mx-auto px-6 py-24">
        <motion.div 
          className="glass rounded-3xl p-12 text-center max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            This season, <span className="gradient-text">ride different</span>
          </h2>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            The whole winter at your fingertips. Free to download on iOS and
            Android.
          </p>
          <AppStoreButtons />
        </motion.div>
      </section>
    </div>
  );
}
