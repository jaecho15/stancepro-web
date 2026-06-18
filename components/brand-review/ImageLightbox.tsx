"use client";

import { useEffect } from "react";
import { X, ZoomIn } from "lucide-react";

type ImageLightboxProps = {
  src: string;
  alt: string;
  whiteMat?: boolean;
  onClose: () => void;
};

export function ImageLightbox({ src, alt, whiteMat = false, onClose }: ImageLightboxProps) {
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
      <div
        className={
          whiteMat
            ? "max-h-[92vh] max-w-[92vw] overflow-auto bg-white p-6 shadow-2xl sm:p-10"
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className={
            whiteMat
              ? "mx-auto max-h-[80vh] w-auto max-w-full object-contain"
              : "max-h-[92vh] max-w-[92vw] object-contain"
          }
        />
      </div>
    </div>
  );
}

type PreviewImageButtonProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  whiteMat?: boolean;
  onOpen: () => void;
};

export function PreviewImageButton({
  src,
  alt,
  width,
  height,
  whiteMat = false,
  onOpen,
}: PreviewImageButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      aria-label={`Enlarge ${alt}`}
    >
      <div className={whiteMat ? "bg-white p-4 sm:p-6" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="mx-auto h-auto w-full max-h-[420px] object-contain transition-transform group-hover:scale-[1.01]"
        />
      </div>
      <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
        <ZoomIn className="h-3.5 w-3.5" />
        Tap to enlarge
      </span>
    </button>
  );
}
