"use client";

import { motion } from "framer-motion";

const stats = [
  { value: "10K+", label: "Active Users" },
  { value: "50K+", label: "Setups Created" },
  { value: "100+", label: "Pro Rider Profiles" },
  { value: "4.8", label: "App Store Rating" },
];

export function StatsSection() {
  return (
    <section className="relative border-y border-white/10 bg-white/5">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold gradient-text mb-2">
                {stat.value}
              </div>
              <div className="text-slate-400">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

