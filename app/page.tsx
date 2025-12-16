"use client";

import { motion } from "framer-motion";
import { 
  Calculator, 
  Users, 
  Video, 
  Mountain, 
  Smartphone,
  ChevronRight,
  Star,
  Snowflake,
  Target,
  TrendingUp
} from "lucide-react";
import Link from "next/link";
import { AppStoreButtons } from "@/components/AppStoreButtons";
import { FeatureCard } from "@/components/FeatureCard";
import { TestimonialCard } from "@/components/TestimonialCard";
import { StatsSection } from "@/components/StatsSection";

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
              <Snowflake className="w-4 h-4" />
              Now available for iOS & Android
            </span>
          </motion.div>

          <motion.h1 
            className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Dial in Your Perfect
            <span className="gradient-text block">Stance Setup</span>
          </motion.h1>

          <motion.p 
            className="text-xl md:text-2xl text-slate-400 mb-10 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Science-backed stance recommendations for snowboard and ski. 
            Compare with pro riders, get personalized coaching, and unlock your potential.
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
            <div className="relative mx-auto w-full max-w-4xl">
              <div className="absolute inset-0 bg-gradient-to-t from-mountain-950 via-transparent to-transparent z-10" />
              <div className="glass rounded-3xl p-4 shadow-2xl animate-glow">
                <div className="bg-mountain-900 rounded-2xl overflow-hidden">
                  {/* Placeholder for app screenshot */}
                  <div className="aspect-[16/9] bg-gradient-to-br from-mountain-800 to-mountain-950 flex items-center justify-center">
                    <div className="text-center p-8">
                      <Smartphone className="w-24 h-24 mx-auto mb-4 text-brand-400" />
                      <p className="text-slate-400">App Preview</p>
                    </div>
                  </div>
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
            From stance calculations to video coaching, StancePro has you covered.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={Calculator}
            title="Stance Calculator"
            description="Get personalized stance width, binding angles, and ski length recommendations based on your body measurements and riding style."
            gradient="from-brand-500 to-cyan-500"
            delay={0}
          />
          <FeatureCard
            icon={Users}
            title="Pro Rider Setups"
            description="Compare your setup with professional snowboarders and skiers. See what the best in the world are riding."
            gradient="from-purple-500 to-pink-500"
            delay={0.1}
          />
          <FeatureCard
            icon={Video}
            title="Video Coaching"
            description="Get personalized feedback from certified coaches. Record your runs, annotate, and improve your technique."
            gradient="from-orange-500 to-red-500"
            delay={0.2}
          />
          <FeatureCard
            icon={Target}
            title="Equipment Matching"
            description="Find the perfect board, bindings, and boots that match your style and measurements from our extensive database."
            gradient="from-green-500 to-emerald-500"
            delay={0.3}
          />
          <FeatureCard
            icon={Mountain}
            title="Field Talks"
            description="Connect with the community. Share your experiences, ask questions, and learn from fellow riders."
            gradient="from-blue-500 to-indigo-500"
            delay={0.4}
          />
          <FeatureCard
            icon={TrendingUp}
            title="Progress Tracking"
            description="Save multiple setups, track your evolution, and fine-tune your gear as you progress."
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
              title: "Enter Your Measurements",
              description: "Input your height, weight, and leg length. Choose your riding style and terrain preference."
            },
            {
              step: "02",
              title: "Get Recommendations",
              description: "Receive science-backed stance width, binding angles, and equipment suggestions tailored to you."
            },
            {
              step: "03",
              title: "Save & Compare",
              description: "Save your setups, compare with pro riders, and fine-tune as you progress."
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
            quote="Finally got my stance dialed in. The difference in my riding is night and day!"
            author="Jake M."
            role="Freestyle Rider"
            rating={5}
            delay={0}
          />
          <TestimonialCard
            quote="The coaching feature is incredible. Got feedback that completely changed my carving technique."
            author="Sarah L."
            role="All-Mountain Rider"
            rating={5}
            delay={0.1}
          />
          <TestimonialCard
            quote="Being able to compare my setup with pros gave me insights I never would have figured out on my own."
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
            Download StancePro today and discover your optimal setup. 
            Free to download with premium coaching features available.
          </p>
          <AppStoreButtons />
        </motion.div>
      </section>
    </div>
  );
}

