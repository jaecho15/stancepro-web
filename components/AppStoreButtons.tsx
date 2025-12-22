"use client";

import { Apple } from "lucide-react";

// Custom Play Store icon since lucide doesn't have one
function PlayStoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 0 1 0 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/>
    </svg>
  );
}

export function AppStoreButtons() {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      {/* App Store Button */}
      <a
        href="https://apps.apple.com/app/stancepro" // Replace with actual URL
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white text-black hover:bg-slate-100 transition-colors min-w-[180px]"
      >
        <Apple className="w-8 h-8" />
        <div className="text-left">
          <div className="text-xs">Download on the</div>
          <div className="text-lg font-semibold -mt-1">App Store</div>
        </div>
      </a>

      {/* Google Play Button */}
      <a
        href="https://play.google.com/store/apps/details?id=com.stancepro" // Replace with actual URL
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white text-black hover:bg-slate-100 transition-colors min-w-[180px]"
      >
        <PlayStoreIcon className="w-7 h-7" />
        <div className="text-left">
          <div className="text-xs">GET IT ON</div>
          <div className="text-lg font-semibold -mt-1">Google Play</div>
        </div>
      </a>
    </div>
  );
}







