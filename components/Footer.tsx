import Link from "next/link";
import { Snowflake, Instagram, Youtube, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-mountain-950/50">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-bold text-xl mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
                <Snowflake className="w-5 h-5 text-white" />
              </div>
              <span>StancePro</span>
            </Link>
            <p className="text-slate-400 text-sm">
              The ultimate snowboard and ski stance calculator. Dial in your setup like the pros.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li><Link href="/features" className="hover:text-white transition-colors">Features</Link></li>
              <li><Link href="/download" className="hover:text-white transition-colors">Download</Link></li>
              <li><Link href="/features#coaching" className="hover:text-white transition-colors">Coaching</Link></li>
              <li><Link href="/features#community" className="hover:text-white transition-colors">Community</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li><Link href="/support" className="hover:text-white transition-colors">Help Center</Link></li>
              <li><Link href="/support#faq" className="hover:text-white transition-colors">FAQ</Link></li>
              <li><Link href="/support#contact" className="hover:text-white transition-colors">Contact Us</Link></li>
              <li><a href="mailto:support@stance-pro.com" className="hover:text-white transition-colors">Email Support</a></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/10">
          <div className="text-center md:text-left mb-4 md:mb-0">
            <p className="text-slate-400 text-sm">
              © {new Date().getFullYear()} StancePro. All rights reserved.
            </p>
            <p className="text-slate-500 text-xs mt-1">
              Developed by Richie Johnston & Jae Cho | <span className="text-slate-400">JC Kraft</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <a 
              href="https://instagram.com/stancepro" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <Instagram className="w-5 h-5" />
            </a>
            <a 
              href="https://youtube.com/@stancepro" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <Youtube className="w-5 h-5" />
            </a>
            <a 
              href="mailto:hello@stance-pro.com"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <Mail className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
