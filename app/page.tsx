"use client";

import { motion } from "framer-motion";
import {
  Calculator,
  Users,
  Video,
  Mountain,
  ChevronRight,
  Star,
  Target,
  TrendingUp
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AppStoreButtons } from "@/components/AppStoreButtons";
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
              Now available for iOS & Android
            </span>
          </motion.div>

          <motion.h1 
            className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            AI-Powered Coaching
            <span className="gradient-text block">& Smarter Gear Decisions</span>
          </motion.h1>

          <motion.p 
            className="text-xl md:text-2xl text-slate-400 mb-10 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            StancePro now goes far beyond setup recommendations with AI-powered
            coaching, AI gear assessment, and human reviews from certified
            top-level trainers and coaches.
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
            <div className="relative mx-auto w-full max-w-6xl">
              <div className="absolute inset-0 bg-gradient-to-t from-mountain-950 via-transparent to-transparent z-10 pointer-events-none" />
              <div className="glass rounded-3xl p-6 sm:p-10 shadow-2xl animate-glow">
                <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
                  {[
                    {
                      src: "/screenshots/home.png",
                      alt: "StancePro home screen with progression tracking and saved stance setup",
                      label: "Progress + Saved Setups",
                    },
                    {
                      src: "/screenshots/gear-setup.png",
                      alt: "StancePro gear setup details with saved board, boots and bindings",
                      label: "Gear Setup",
                    },
                    {
                      src: "/screenshots/my-requests.png",
                      alt: "StancePro rider coaching requests queue with pending reviews",
                      label: "Coaching Requests",
                    },
                    {
                      src: "/screenshots/body-measurement.png",
                      alt: "StancePro live body measurement with pose detection and leg length",
                      label: "Body Measurement",
                    },
                    {
                      src: "/screenshots/pose-analysis.png",
                      alt: "StancePro pose analysis overlay on a snowboard riding clip",
                      label: "AI Pose Analysis",
                    },
                  ].map((shot, index) => (
                    <motion.div
                      key={shot.src}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.5 + index * 0.1 }}
                      className="flex flex-col items-center"
                    >
                      <div className="relative w-[150px] sm:w-[180px] lg:w-[200px] aspect-[1284/2778] rounded-[2.25rem] bg-mountain-950 ring-1 ring-white/10 shadow-2xl overflow-hidden">
                        <Image
                          src={shot.src}
                          alt={shot.alt}
                          fill
                          sizes="(min-width: 1024px) 200px, (min-width: 640px) 180px, 150px"
                          priority={index === 0}
                          className="object-cover"
                        />
                      </div>
                      <p className="mt-4 text-sm text-slate-400 text-center">{shot.label}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
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
            From AI coaching and gear assessment to certified trainer reviews,
            saved setups, and community tools, StancePro helps you progress with
            more confidence.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={Video}
            title="AI Coaching + Certified Trainers"
            description="Upload riding clips for AI feedback, then level up with human reviews from certified coaches and top-level trainers."
            gradient="from-brand-500 to-cyan-500"
            delay={0}
          />
          <FeatureCard
            icon={Target}
            title="AI Gear Assessment"
            description="Use AI-assisted gear assessment alongside saved gear, comparisons, and setup context to make better equipment decisions."
            gradient="from-purple-500 to-pink-500"
            delay={0.1}
          />
          <FeatureCard
            icon={Calculator}
            title="Snowboard + Ski Setup Tools"
            description="Build personalized snowboard and ski recommendations from your measurements, riding style, terrain, and gear context."
            gradient="from-orange-500 to-red-500"
            delay={0.2}
          />
          <FeatureCard
            icon={Users}
            title="Rider Setup Inspiration"
            description="Browse rider profiles, compare stance widths and angles, and save references alongside your own setups."
            gradient="from-green-500 to-emerald-500"
            delay={0.3}
          />
          <FeatureCard
            icon={Mountain}
            title="Community & Messaging"
            description="Join Field Talks, explore training media and reviews, and stay in touch through built-in messaging."
            gradient="from-blue-500 to-indigo-500"
            delay={0.4}
          />
          <FeatureCard
            icon={TrendingUp}
            title="Save, Track & Share"
            description="Save multiple setups and gear kits, revisit progress over time, and share or import setups with QR tools."
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
            Get Dialed in
            <span className="gradient-text"> 3 Easy Steps</span>
          </motion.h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {[
            {
              step: "01",
              title: "Build Your Rider Profile",
              description: "Choose snowboard or ski, add your measurements, riding style, terrain focus, and gear context."
            },
            {
              step: "02",
              title: "Get AI Coaching & Gear Insight",
              description: "Review AI-powered coaching feedback, gear assessment guidance, and setup recommendations tailored to your riding."
            },
            {
              step: "03",
              title: "Add Expert Human Review",
              description: "Bring in certified coaches and top-level trainers when you want deeper technical review, progression support, and standards-based feedback."
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
            Ready to Ride Better?
          </h2>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            Download StancePro today for AI-powered coaching, AI gear
            assessment, certified trainer reviews, and the setup tools that tie
            it all together.
          </p>
          <AppStoreButtons />
        </motion.div>
      </section>
    </div>
  );
}

