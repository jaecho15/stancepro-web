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
  Camera,
  MessageCircle,
  BookOpen,
  Award,
  Zap,
  Shield,
  Cloud
} from "lucide-react";
import { AppStoreButtons } from "@/components/AppStoreButtons";

const features = [
  {
    id: "calculator",
    title: "Stance Calculator",
    description: "Our advanced stance calculator uses biomechanical principles and industry research to recommend your optimal stance setup.",
    icon: Calculator,
    gradient: "from-brand-500 to-cyan-500",
    details: [
      { icon: Ruler, text: "Personalized stance width based on your leg length and height" },
      { icon: Compass, text: "Binding angle recommendations for your riding style" },
      { icon: Sliders, text: "Setback calculations for different terrain" },
      { icon: Target, text: "Ski length recommendations using performance-focused formula" },
    ]
  },
  {
    id: "pro-riders",
    title: "Pro Rider Database",
    description: "Compare your setup with over 100 professional snowboarders and skiers. See exactly what the best in the world are riding.",
    icon: Users,
    gradient: "from-purple-500 to-pink-500",
    details: [
      { icon: Award, text: "100+ verified pro rider setups" },
      { icon: Target, text: "Filter by riding style, height, and weight" },
      { icon: TrendingUp, text: "See how your setup compares" },
      { icon: BookOpen, text: "Learn from the pros' equipment choices" },
    ]
  },
  {
    id: "coaching",
    title: "Video Coaching",
    description: "Get personalized feedback from certified coaches. Record your runs, add annotations, and receive expert analysis.",
    icon: Video,
    gradient: "from-orange-500 to-red-500",
    details: [
      { icon: Camera, text: "Record directly in the app or upload existing videos" },
      { icon: MessageCircle, text: "Voice annotations and drawing tools" },
      { icon: Users, text: "Connect with certified coaches" },
      { icon: Zap, text: "Quick turnaround on feedback" },
    ]
  },
  {
    id: "community",
    title: "Community Hub",
    description: "Connect with fellow riders, share your experiences, and learn from the community.",
    icon: Mountain,
    gradient: "from-green-500 to-emerald-500",
    details: [
      { icon: MessageCircle, text: "Field Talks - Share experiences on the slopes" },
      { icon: BookOpen, text: "Gear Reviews - Community equipment reviews" },
      { icon: Video, text: "Training Media - Professional training videos" },
      { icon: Award, text: "Events - Find and join riding events" },
    ]
  },
  {
    id: "equipment",
    title: "Equipment Database",
    description: "Browse our extensive database of snowboards, skis, bindings, and boots. Find the perfect gear for your setup.",
    icon: Target,
    gradient: "from-blue-500 to-indigo-500",
    details: [
      { icon: Shield, text: "Verified specs from manufacturers" },
      { icon: Sliders, text: "Filter by size, flex, and style" },
      { icon: TrendingUp, text: "Compatibility recommendations" },
      { icon: Cloud, text: "Always up-to-date catalog" },
    ]
  },
  {
    id: "tracking",
    title: "Setup Tracking",
    description: "Save multiple setups, track your evolution, and fine-tune your gear as you progress.",
    icon: TrendingUp,
    gradient: "from-amber-500 to-orange-500",
    details: [
      { icon: Cloud, text: "Cloud sync across all your devices" },
      { icon: BookOpen, text: "Detailed setup history" },
      { icon: Sliders, text: "Compare different configurations" },
      { icon: Zap, text: "Quick setup switching" },
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
            From stance calculations to video coaching, StancePro gives you everything 
            you need to optimize your setup and improve your riding.
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
            Download StancePro today and unlock all these features.
            Free to download with premium coaching available.
          </p>
          <AppStoreButtons />
        </motion.div>
      </section>
    </div>
  );
}

