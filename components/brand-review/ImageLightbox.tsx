"use client";

import { useEffect } from "react";
import { X, ZoomIn } from "lucide-react";

type ImageLightboxProps = {
  src: string;
  alt: string;
  onClose: () => void;
};

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Enlarged preview: ${alt}`}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full border border-white/20 bg-black/50 p-2 text-white hover:bg-black/70"
        aria-label="Close enlarged preview"
      >
        <X className="h-6 w-6" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-[92vh] max-w-[92vw] object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

type PreviewImageButtonProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  onOpen: () => void;
};

export function PreviewImageButton({
  src,
  alt,
  width,
  height,
  onOpen,
}: PreviewImageButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      aria-label={`Enlarge ${alt}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="mx-auto h-auto w-full max-h-[420px] object-contain transition-transform group-hover:scale-[1.01]"
      />
      <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
        <ZoomIn className="h-3.5 w-3.5" />
        Tap to enlarge
      </span>
    </button>
  );
}
