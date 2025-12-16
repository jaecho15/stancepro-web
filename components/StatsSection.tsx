"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Stats {
  users: string;
  setups: string;
  proRiders: number;
  rating: string;
}

const defaultStats = [
  { value: "1K+", label: "Active Users" },
  { value: "5K+", label: "Setups Created" },
  { value: "100+", label: "Pro Rider Profiles" },
  { value: "4.8", label: "App Store Rating" },
];

export function StatsSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const displayStats = stats
    ? [
        { value: stats.users, label: "Active Users" },
        { value: stats.setups, label: "Setups Created" },
        { value: `${stats.proRiders}+`, label: "Pro Rider Profiles" },
        { value: stats.rating, label: "App Store Rating" },
      ]
    : defaultStats;

  return (
    <section className="relative border-y border-white/10 bg-white/5">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {displayStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className={`text-4xl md:text-5xl font-bold gradient-text mb-2 ${loading ? 'animate-pulse' : ''}`}>
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
