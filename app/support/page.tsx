"use client";

import { motion } from "framer-motion";
import { Mail, MessageCircle, ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";

const faqs = [
  {
    question: "How accurate is the stance calculator?",
    answer: "Our stance calculator is based on biomechanical research and industry standards. While it provides excellent starting points, we always recommend fine-tuning based on your personal comfort and riding style. The recommendations are designed to give you an optimal baseline that most riders find comfortable."
  },
  {
    question: "Can I use StancePro for skiing too?",
    answer: "Yes! StancePro supports both snowboarding and skiing. Our ski calculator provides recommendations for ski length, mount position, and DIN settings (as reference only - always have a certified technician set your bindings)."
  },
  {
    question: "How does video coaching work?",
    answer: "Record your riding directly in the app or upload existing videos. Your video is then assigned to a certified coach who will add voice annotations, drawings, and text feedback. You'll receive notification when your coached session is ready to view."
  },
  {
    question: "Is my data synced across devices?",
    answer: "Yes, when you create an account, all your setups, preferences, and coaching sessions are synced across your devices via our secure cloud infrastructure."
  },
  {
    question: "Can I use the app offline?",
    answer: "Yes! Your saved setups, recent coaching sessions, and most features work offline. Videos and thumbnails are cached automatically for offline viewing. Data syncs when you're back online."
  },
  {
    question: "How do I cancel my Pro subscription?",
    answer: "You can manage your subscription through the App Store (iOS) or Google Play (Android). Go to your account settings in the respective store and select 'Subscriptions' to cancel or modify your plan."
  },
  {
    question: "Are the pro rider setups verified?",
    answer: "We source our pro rider data from published interviews, sponsor content, and official sources. While setups may change between seasons, we strive to keep our database as current and accurate as possible."
  },
  {
    question: "What measurements do I need for the calculator?",
    answer: "For the best results, you'll need your height, weight, and optionally your leg length. The app can estimate leg length from your height if you don't have an exact measurement."
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-center justify-between text-left"
      >
        <span className="font-semibold pr-8">{question}</span>
        <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        className="overflow-hidden"
      >
        <p className="pb-6 text-slate-400">{answer}</p>
      </motion.div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
      </div>

      {/* Hero Section */}
      <section className="relative container mx-auto px-6 pt-20 pb-16">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1 
            className="text-4xl md:text-6xl font-bold mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            How Can We
            <span className="gradient-text"> Help?</span>
          </motion.h1>
          <motion.p 
            className="text-xl text-slate-400 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Find answers to common questions or get in touch with our support team.
          </motion.p>
        </div>
      </section>

      {/* Contact Options */}
      <section id="contact" className="relative container mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <motion.a
            href="mailto:support@stance-pro.com"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-2xl p-6 hover:bg-white/10 transition-colors group"
          >
            <Mail className="w-10 h-10 text-brand-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Email Support</h3>
            <p className="text-slate-400 mb-4">Get help via email. We typically respond within 24 hours.</p>
            <span className="inline-flex items-center gap-2 text-brand-400 group-hover:gap-3 transition-all">
              support@stance-pro.com
              <ExternalLink className="w-4 h-4" />
            </span>
          </motion.a>

          <motion.a
            href="https://instagram.com/stancepro"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-6 hover:bg-white/10 transition-colors group"
          >
            <MessageCircle className="w-10 h-10 text-purple-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Social Media</h3>
            <p className="text-slate-400 mb-4">Follow us on Instagram for tips, updates, and community highlights.</p>
            <span className="inline-flex items-center gap-2 text-purple-400 group-hover:gap-3 transition-all">
              @stancepro
              <ExternalLink className="w-4 h-4" />
            </span>
          </motion.a>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="relative container mx-auto px-6 py-24">
        <div className="max-w-3xl mx-auto">
          <motion.h2 
            className="text-3xl md:text-4xl font-bold mb-12 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Frequently Asked Questions
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-2xl p-6 md:p-8"
          >
            {faqs.map((faq) => (
              <FAQItem key={faq.question} {...faq} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* Still Need Help */}
      <section className="relative container mx-auto px-6 py-16">
        <motion.div 
          className="glass rounded-3xl p-12 text-center max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-bold mb-4">Still Need Help?</h2>
          <p className="text-slate-400 mb-6">
            Can&apos;t find what you&apos;re looking for? Our support team is here to help.
          </p>
          <a
            href="mailto:support@stance-pro.com"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white font-medium hover:from-brand-400 hover:to-brand-500 transition-all"
          >
            <Mail className="w-5 h-5" />
            Contact Support
          </a>
        </motion.div>
      </section>
    </div>
  );
}

