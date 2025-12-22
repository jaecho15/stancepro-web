"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, User } from "lucide-react";

interface ProRider {
  id: string;
  name: string;
  stance_width: number | null;
  binding_angle_front: number | null;
  binding_angle_rear: number | null;
  image_url: string | null;
  sponsor: string | null;
  styles: string[] | null;
}

export function ProRidersShowcase() {
  const [riders, setRiders] = useState<ProRider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRiders() {
      try {
        const res = await fetch('/api/pro-riders?limit=6');
        if (res.ok) {
          const data = await res.json();
          setRiders(data);
        }
      } catch (error) {
        console.error('Failed to load pro riders:', error);
      } finally {
        setLoading(false);
      }
    }
    loadRiders();
  }, []);

  if (loading) {
    return (
      <section className="relative container mx-auto px-6 py-24">
        <div className="text-center">
          <div className="animate-pulse text-slate-400">Loading pro riders...</div>
        </div>
      </section>
    );
  }

  if (riders.length === 0) {
    return null;
  }

  return (
    <section className="relative container mx-auto px-6 py-24">
      <div className="text-center mb-12">
        <motion.h2 
          className="text-4xl md:text-5xl font-bold mb-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Learn from the
          <span className="gradient-text"> Pros</span>
        </motion.h2>
        <motion.p 
          className="text-xl text-slate-400 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          Compare your setup with professional riders and see what works for the best in the world.
        </motion.p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {riders.map((rider, index) => (
          <motion.div
            key={rider.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className="glass rounded-xl p-4 text-center hover:bg-white/10 transition-colors"
          >
            {/* Rider Image */}
            <div className="w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden bg-mountain-800">
              {rider.image_url ? (
                <Image
                  src={rider.image_url}
                  alt={rider.name}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-10 h-10 text-slate-500" />
                </div>
              )}
            </div>

            {/* Name */}
            <h3 className="font-semibold text-sm mb-1 truncate">{rider.name}</h3>

            {/* Stance Info */}
            {rider.stance_width && (
              <p className="text-xs text-slate-400">
                {rider.stance_width}cm | {rider.binding_angle_front}°/{rider.binding_angle_rear}°
              </p>
            )}

            {/* Style Tags */}
            {rider.styles && rider.styles.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-1">
                {rider.styles.slice(0, 2).map((style) => (
                  <span 
                    key={style}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300"
                  >
                    {style}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="text-center mt-8">
        <Link 
          href="/download"
          className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 transition-colors"
        >
          See all {riders.length > 0 ? '100+' : ''} pro setups in the app
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}







