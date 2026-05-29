import Image from "next/image";

type BrandLogoProps = {
  iconOnly?: boolean;
  iconSize?: number;
  wordmarkWidth?: number;
  className?: string;
};

export function BrandLogo({
  iconOnly = false,
  iconSize = 32,
  wordmarkWidth = 160,
  className = "",
}: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <Image
        src="/branding/logo-dark.png"
        alt="StancePro logo"
        width={iconSize}
        height={iconSize}
        className="shrink-0"
        priority
      />
      {!iconOnly && (
        <Image
          src="/branding/logo-title-dark.png"
          alt="StancePro"
          width={wordmarkWidth}
          height={Math.round(wordmarkWidth / 5)}
          className="h-auto w-auto max-w-full"
          priority
        />
      )}
    </span>
  );
}
