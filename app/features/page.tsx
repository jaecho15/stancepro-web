"use client";

import { motion } from "framer-motion";
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
  Zap
} from "lucide-react";
import { AppStoreButtons } from "@/components/AppStoreButtons";

const features = [
  {
    id: "coaching",
    title: "AI Coaching + Certified Trainers",
    description: "Upload riding clips for AI feedback, then add human coaching from certified coaches and top-level trainers when you want deeper review.",
    icon: Video,
    gradient: "from-brand-500 to-cyan-500",
    details: [
      { icon: Video, text: "Upload existing riding clips from your device" },
      { icon: MessageCircle, text: "Choose AI feedback or request human coach review" },
      { icon: Users, text: "Top-level trainers are available for advanced coaching tiers" },
      { icon: Zap, text: "Review completed sessions and follow-up actions in one place" },
    ]
  },
  {
    id: "equipment",
    title: "AI Gear Assessment",
    description: "Use AI-assisted gear assessment together with your saved gear, comparisons, and riding context to make smarter equipment decisions.",
    icon: Target,
    gradient: "from-purple-500 to-pink-500",
    details: [
      { icon: Sliders, text: "Assess gear with riding context in mind" },
      { icon: Target, text: "Save gear to your personal kit and shortlists" },
      { icon: TrendingUp, text: "Compare options side by side before deciding" },
      { icon: BookOpen, text: "Build setups around your saved equipment" },
    ]
  },
  {
    id: "calculator",
    title: "Snowboard + Ski Setup Tools",
    description: "Build personalized snowboard and ski recommendations from your body profile, riding style, terrain, and equipment context.",
    icon: Calculator,
    gradient: "from-orange-500 to-red-500",
    details: [
      { icon: Ruler, text: "Profile-based stance width and sizing guidance" },
      { icon: Compass, text: "Snowboard angles, setback, and ski setup recommendations" },
      { icon: Sliders, text: "Saved setups you can revisit, edit, and compare" },
      { icon: Target, text: "QR share and import tools for quick handoff" },
    ]
  },
  {
    id: "pro-riders",
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
    id: "community",
    title: "Community Hub",
    description: "Field Talks, reviews, events, and training media give riders a place to learn, share, and stay connected.",
    icon: Mountain,
    gradient: "from-blue-500 to-indigo-500",
    details: [
      { icon: MessageCircle, text: "Field Talks for questions, stories, and discussion" },
      { icon: BookOpen, text: "Community reviews for stance and gear feedback" },
      { icon: Video, text: "Training media with technique-focused content" },
      { icon: Award, text: "Events and browsing tools for the riding community" },
    ]
  },
  {
    id: "tracking",
    title: "Messaging, Saves & Progress",
    description: "Keep conversations, saved setups, gear, and progression tools together in one account.",
    icon: TrendingUp,
    gradient: "from-amber-500 to-orange-500",
    details: [
      { icon: MessageCircle, text: "Direct messaging with conversation tracking" },
      { icon: BookOpen, text: "Saved stance and gear setups tied to your account" },
      { icon: Sliders, text: "Progression and coaching hub tools for riders and coaches" },
      { icon: Zap, text: "Premium coaching credits and upgrade flows live in-app" },
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
            Powerful Features for
            <span className="gradient-text block">Every Rider</span>
          </motion.h1>
          <motion.p 
            className="text-xl text-slate-400 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            AI-powered coaching, AI gear assessment, certified trainer reviews,
            and setup tools all work together inside StancePro.
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
              {/* Icon/Visual */}
              <div className="flex-1 flex justify-center">
                <div className={`w-64 h-64 rounded-3xl bg-gradient-to-br ${feature.gradient} p-1`}>
                  <div className="w-full h-full rounded-3xl bg-mountain-900 flex items-center justify-center">
                    <feature.icon className="w-24 h-24 text-white/80" />
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1">
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
            Ready to Get Started?
          </h2>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            Download StancePro today and explore AI coaching, AI gear
            assessment, certified trainer reviews, and the setup tools that
            support them.
          </p>
          <AppStoreButtons />
        </motion.div>
      </section>
    </div>
  );
}







