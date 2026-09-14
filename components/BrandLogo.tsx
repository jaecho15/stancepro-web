import Image from "next/image";

type BrandLogoProps = {
  iconOnly?: boolean;
  iconSize?: number;
  wordmarkWidth?: number;
  /** Extra classes on the wordmark <img>, e.g. a responsive width that
   *  overrides `wordmarkWidth` at some breakpoints (`w-[180px] lg:w-[234px]`). */
  wordmarkClassName?: string;
  className?: string;
};

const WORDMARK_ASPECT_RATIO = 2612 / 250;
const WORDMARK_ASSET_VERSION = "20260710-geometric-proportional-v7-3x";

export function BrandLogo({
  iconOnly = false,
  iconSize = 32,
  wordmarkWidth = 160,
  wordmarkClassName = "",
  className = "",
}: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`.trim()}>
      <Image
        src="/branding/logo-dark.png"
        alt="StancePro logo"
        width={iconSize}
        height={iconSize}
        className="shrink-0"
        priority
        unoptimized
      />
      {!iconOnly && (
        <Image
          src={`/branding/logo-title-dark.png?v=${WORDMARK_ASSET_VERSION}`}
          alt="StancePro"
          width={wordmarkWidth}
          height={Math.round(wordmarkWidth / WORDMARK_ASPECT_RATIO)}
          className={`h-auto max-w-full ${wordmarkClassName}`.trim()}
          priority
          unoptimized
        />
      )}
    </span>
  );
}
