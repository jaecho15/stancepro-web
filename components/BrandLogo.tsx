import Image from "next/image";

type BrandLogoProps = {
  iconOnly?: boolean;
  iconSize?: number;
  wordmarkWidth?: number;
  className?: string;
};

const WORDMARK_ASPECT_RATIO = 2612 / 250;
const WORDMARK_ASSET_VERSION = "20260710-geometric-proportional-v7-3x";

export function BrandLogo({
  iconOnly = false,
  iconSize = 32,
  wordmarkWidth = 160,
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
          className="h-auto max-w-full"
          priority
          unoptimized
        />
      )}
    </span>
  );
}
