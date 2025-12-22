"use client";

import { motion } from "framer-motion";
import { Smartphone, Check, Sparkles } from "lucide-react";
import { AppStoreButtons } from "@/components/AppStoreButtons";

const freeFeatures = [
  "Stance calculator for snowboard & ski",
  "Save up to 3 setups",
  "Pro rider database access",
  "Equipment database",
  "Community access (Field Talks)",
  "Basic gear reviews",
];

const proFeatures = [
  "Everything in Free, plus:",
  "Unlimited setup saves",
  "Video coaching sessions",
  "Priority coach matching",
  "Advanced analytics",
  "Training media library",
  "Ad-free experience",
];

export default function DownloadPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 -left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      {/* Hero Section */}
      <section className="relative container mx-auto px-6 pt-20 pb-16">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm text-brand-300 mb-8"
          >
            <Sparkles className="w-4 h-4" />
            Available on iOS & Android
          </motion.div>

          <motion.h1 
            className="text-4xl md:text-6xl font-bold mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Download
            <span className="gradient-text"> StancePro</span>
          </motion.h1>
          
          <motion.p 
            className="text-xl text-slate-400 max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Get the app that's helping thousands of riders dial in their perfect setup. 
            Free to download with optional premium features.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <AppStoreButtons />
          </motion.div>
        </div>
      </section>

      {/* App Preview */}
      <section className="relative container mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-md mx-auto"
        >
          <div className="glass rounded-3xl p-4 shadow-2xl animate-glow">
            <div className="bg-mountain-900 rounded-2xl overflow-hidden">
              <div className="aspect-[9/16] bg-gradient-to-br from-mountain-800 to-mountain-950 flex items-center justify-center">
                <div className="text-center p-8">
                  <Smartphone className="w-20 h-20 mx-auto mb-4 text-brand-400" />
                  <p className="text-slate-400">App Screenshot</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Pricing Section */}
      <section className="relative container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <motion.h2 
            className="text-3xl md:text-4xl font-bold mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Simple Pricing
          </motion.h2>
          <motion.p 
            className="text-xl text-slate-400"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Start free, upgrade when you&apos;re ready for more.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Tier */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-2xl p-8"
          >
            <h3 className="text-2xl font-bold mb-2">Free</h3>
            <p className="text-slate-400 mb-6">Everything you need to get started</p>
            <div className="text-4xl font-bold mb-8">
              $0
              <span className="text-lg text-slate-400 font-normal">/forever</span>
            </div>
            <ul className="space-y-4 mb-8">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="text-slate-300">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="text-center">
              <AppStoreButtons />
            </div>
          </motion.div>

          {/* Pro Tier */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="relative glass rounded-2xl p-8 border-2 border-brand-500"
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-500 rounded-full text-sm font-semibold">
              Most Popular
            </div>
            <h3 className="text-2xl font-bold mb-2">Pro</h3>
            <p className="text-slate-400 mb-6">For serious riders who want it all</p>
            <div className="text-4xl font-bold mb-8">
              $9.99
              <span className="text-lg text-slate-400 font-normal">/month</span>
            </div>
            <ul className="space-y-4 mb-8">
              {proFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-brand-400" />
                  <span className="text-slate-300">{feature}</span>
                </li>
              ))}
            </ul>
            <p className="text-center text-sm text-slate-400">
              Upgrade in-app after downloading
            </p>
          </motion.div>
        </div>
      </section>

      {/* System Requirements */}
      <section className="relative container mx-auto px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="text-2xl font-bold mb-8">System Requirements</h3>
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="glass rounded-xl p-6">
              <h4 className="font-semibold mb-2">iOS</h4>
              <p className="text-slate-400">Requires iOS 15.0 or later. Compatible with iPhone and iPad.</p>
            </div>
            <div className="glass rounded-xl p-6">
              <h4 className="font-semibold mb-2">Android</h4>
              <p className="text-slate-400">Requires Android 8.0 or later. Compatible with most devices.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}







