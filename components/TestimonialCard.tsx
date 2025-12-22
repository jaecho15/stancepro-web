"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

interface TestimonialCardProps {
  quote: string;
  author: string;
  role: string;
  rating: number;
  delay?: number;
}

export function TestimonialCard({ quote, author, role, rating, delay = 0 }: TestimonialCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="glass rounded-2xl p-6"
    >
      {/* Stars */}
      <div className="flex gap-1 mb-4">
        {Array.from({ length: rating }).map((_, i) => (
          <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
        ))}
      </div>
      
      {/* Quote */}
      <p className="text-slate-300 mb-4 italic">&ldquo;{quote}&rdquo;</p>
      
      {/* Author */}
      <div>
        <p className="font-semibold">{author}</p>
        <p className="text-sm text-slate-400">{role}</p>
      </div>
    </motion.div>
  );
}







