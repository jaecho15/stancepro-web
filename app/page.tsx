"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Calculator,
  Users,
  Video,
  Mountain,
  ChevronRight,
  Snowflake,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AppStoreButtons } from "@/components/AppStoreButtons";
import { WebToolCards } from "@/components/WebToolCards";
import { FeatureCard } from "@/components/FeatureCard";
import { TestimonialCard } from "@/components/TestimonialCard";
import { StatsSection } from "@/components/StatsSection";
import { ProRidersShowcase } from "@/components/ProRidersShowcase";
import { BrandLogo } from "@/components/BrandLogo";

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      {/* Hero Section */}
      <section className="relative container mx-auto px-6 pt-20 pb-32">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm text-brand-300 mb-8">
              <BrandLogo iconOnly iconSize={16} />
              <span className="tracking-[0.2em]">RIDE · TRACK · IMPROVE</span>
            </span>
          </motion.div>

          <motion.h1 
            className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Every moment on snow.
            <span className="gradient-text block">One app.</span>
          </motion.h1>

          <motion.p 
            className="text-xl md:text-2xl text-slate-400 mb-10 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            3D maps of 3,400+ resorts, snow by hour and elevation, every run
            auto-tracked, AI video analysis, and coaching by top-level trainers.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
          >
            <AppStoreButtons />
          </motion.div>

          {/* Hero Image / App Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="relative mt-16"
          >
            {/* Wider than the hero text column so six phones fit in one row at lg. */}
            <div className="relative mx-auto w-full max-w-6xl lg:-mx-16 lg:w-[calc(100%+8rem)]">
              <div className="absolute inset-0 bg-gradient-to-t from-mountain-950 via-transparent to-transparent z-10 pointer-events-none" />
              <div className="glass rounded-3xl p-6 sm:p-10 shadow-2xl animate-glow">
                {/* The six stages of a season, in the order the ad tells them.
                    Phones swipe sideways on narrow screens; three-up from sm,
                    all six in one row from lg. */}
                <div className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6">
                  {[
                    {
                      src: "/screenshots/app/setup-stance-gear.webp",
                      alt: "StancePro stance setup with binding angles and width drawn on a snowboard, plus saved gear",
                      stage: "Setup",
                      label: "Stance & gear",
                    },
                    {
                      src: "/screenshots/app/plan-snow-forecast.webp",
                      alt: "StancePro snow forecast for a resort by day, hour and elevation band",
                      stage: "Plan",
                      label: "Snow forecast",
                    },
                    {
                      src: "/screenshots/app/ride-tracker-session.webp",
                      alt: "StancePro ride tracker session stats: max speed, vertical, distance, jumps and turns",
                      stage: "Ride",
                      label: "Auto-tracked",
                    },
                    {
                      src: "/screenshots/app/replay-3d-map.webp",
                      alt: "StancePro 3D resort map with a session track drawn on LiDAR terrain",
                      stage: "Replay",
                      label: "3D route & clips",
                    },
                    {
                      src: "/screenshots/app/coach-ai-analysis.webp",
                      alt: "StancePro session details with AI analysis feedback and a request for human coaching",
                      stage: "Coach",
                      label: "AI + pro trainers",
                    },
                    {
                      src: "/screenshots/app/progress-home.webp",
                      alt: "StancePro home screen with skill progress, snow forecast and ride tracker cards",
                      stage: "Progress",
                      label: "Skill progression",
                    },
                  ].map((shot, index) => (
                    <motion.div
                      key={shot.src}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.5 + index * 0.1 }}
                      className="flex w-[160px] shrink-0 snap-center flex-col items-center sm:w-auto sm:shrink"
                    >
                      <div className="relative w-full max-w-[200px] aspect-[1080/2424] rounded-[1.75rem] bg-mountain-950 ring-1 ring-white/10 shadow-2xl overflow-hidden">
                        <Image
                          src={shot.src}
                          alt={shot.alt}
                          fill
                          sizes="200px"
                          priority={index === 0}
                          className="object-cover"
                        />
                      </div>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">{shot.stage}</p>
                      <p className="mt-1 text-sm text-slate-400 text-center">{shot.label}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Web tools — member features that run right in the browser */}
      <section className="relative container mx-auto px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-10"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Now in <span className="gradient-text">Your Browser</span>
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Four StancePro tools run on the web with the same account you use
              in the app — sign in and pick up where you left off.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <WebToolCards />
            <p className="text-center mt-6">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-brand-400 hover:text-brand-300 font-medium"
              >
                Sign in to get started <ChevronRight className="w-4 h-4" />
              </Link>
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <StatsSection />

      {/* Features Section */}
      <section id="features" className="relative container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <motion.h2 
            className="text-4xl md:text-5xl font-bold mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Everything You Need to
            <span className="gradient-text"> Ride Better</span>
          </motion.h2>
          <motion.p 
            className="text-xl text-slate-400 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Plan the day, ride it, replay it, and get coached on it. The whole
            winter in one app.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={Mountain}
            title="3,400+ Resorts in Full 3D"
            description="Real LiDAR terrain with runs, lifts, slope angle and off-piste zones. Fly the mountain before you ride it."
            gradient="from-brand-500 to-cyan-500"
            delay={0}
          />
          <FeatureCard
            icon={Snowflake}
            title="Tomorrow's Snow, Known Today"
            description="Snowfall by hour and by elevation band, plus a season outlook for the resorts you follow."
            gradient="from-blue-500 to-indigo-500"
            delay={0.1}
          />
          <FeatureCard
            icon={Activity}
            title="Every Run, Auto-Tracked"
            description="Speed, vertical, jumps, turns and lifts recorded without touching your phone. Replay the session in 3D."
            gradient="from-green-500 to-emerald-500"
            delay={0.2}
          />
          <FeatureCard
            icon={Video}
            title="AI Video Analysis"
            description="Upload a clip and AI breaks it down: pose analysis, skeleton overlay, turn metrics, and your ride rebuilt as a 3D rider."
            gradient="from-purple-500 to-pink-500"
            delay={0.3}
          />
          <FeatureCard
            icon={Users}
            title="Coaching by Top-Level Trainers"
            description="Online, frame-by-frame annotations with voice feedback from certified coaches."
            gradient="from-orange-500 to-red-500"
            delay={0.4}
          />
          <FeatureCard
            icon={Calculator}
            title="Stance & Gear, Matched to You"
            description="A stance calculated from your body, gear suitability analysis, and skill progression across the season."
            gradient="from-amber-500 to-orange-500"
            delay={0.5}
          />
        </div>

        <div className="text-center mt-12">
          <Link 
            href="/features"
            className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 transition-colors"
          >
            See all features
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Pro Riders Section */}
      <ProRidersShowcase />

      {/* How It Works Section */}
      <section className="relative container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <motion.h2 
            className="text-4xl md:text-5xl font-bold mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            One Season,
            <span className="gradient-text"> Three Moves</span>
          </motion.h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {[
            {
              step: "01",
              title: "Set Up",
              description: "Snowboard or ski, your measurements, a stance calculated for your body, and gear checked for fit. Then pick the day from the snow forecast."
            },
            {
              step: "02",
              title: "Ride",
              description: "Start a session and put the phone away. Every run, lift, jump and turn is recorded, then replayed on the 3D map."
            },
            {
              step: "03",
              title: "Improve",
              description: "Upload a clip for AI analysis, send it to a top-level trainer for annotated feedback, and watch your skill tree fill in."
            }
          ].map((item, index) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-6xl font-bold text-brand-500/30 mb-4">{item.step}</div>
              <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
              <p className="text-slate-400">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="relative container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <motion.h2 
            className="text-4xl md:text-5xl font-bold mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Loved by Riders
            <span className="gradient-text"> Worldwide</span>
          </motion.h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <TestimonialCard
            quote="The AI coaching gave me clear next steps, and the coach follow-up helped me actually fix what was holding my riding back."
            author="Jake M."
            role="Freestyle Rider"
            rating={5}
            delay={0}
          />
          <TestimonialCard
            quote="Being able to combine AI feedback with a certified coach review completely changed how I approached my carving."
            author="Sarah L."
            role="All-Mountain Rider"
            rating={5}
            delay={0.1}
          />
          <TestimonialCard
            quote="The gear assessment tools made it much easier to narrow down what actually fits my riding instead of just guessing."
            author="Mike R."
            role="Park Rider"
            rating={5}
            delay={0.2}
          />
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

