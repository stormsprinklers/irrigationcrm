import Image from "next/image";
import { cn } from "@/lib/utils";
import { stormBrand } from "@/lib/branding";

type StormLogoProps = {
  className?: string;
  imageClassName?: string;
  showWordmark?: boolean;
  priority?: boolean;
};

export function StormLogo({
  className,
  imageClassName,
  showWordmark = false,
  priority = false,
}: StormLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src={stormBrand.logoPath}
        alt="Storm Sprinklers"
        width={160}
        height={160}
        priority={priority}
        className={cn("h-9 w-auto object-contain", imageClassName)}
      />
      {showWordmark ? (
        <span className="font-display text-base font-bold tracking-tight text-storm-navy">
          Storm Sprinklers
        </span>
      ) : null}
    </span>
  );
}
