import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type PortalOfferCardData = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

type Props = {
  offer: PortalOfferCardData;
  className?: string;
  compact?: boolean;
};

export function PortalOfferCard({ offer, className, compact }: Props) {
  const href = offer.ctaUrl?.trim() || null;
  const label = offer.ctaLabel?.trim() || "Learn more";

  const body = (
    <>
      {offer.imageUrl ? (
        <div
          className={cn(
            "overflow-hidden bg-storm-ice/40",
            compact ? "aspect-[16/9]" : "aspect-[2/1] sm:aspect-[21/9]"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={offer.imageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : null}
      <div className={cn("flex flex-1 flex-col gap-2", compact ? "p-4" : "p-5")}>
        <h3
          className={cn(
            "font-display font-bold text-storm-navy",
            compact ? "text-base" : "text-lg"
          )}
        >
          {offer.title}
        </h3>
        {offer.description ? (
          <p className={cn("text-muted-foreground", compact ? "text-sm line-clamp-2" : "text-sm")}>
            {offer.description}
          </p>
        ) : null}
        {href ? (
          <span
            className={cn(
              "mt-auto inline-flex w-fit items-center gap-1.5 rounded-md bg-storm-sky px-3 py-2 text-sm font-semibold text-white",
              "transition group-hover:bg-storm-navy"
            )}
          >
            {label}
            <ExternalLink className="h-3.5 w-3.5 opacity-90" aria-hidden />
          </span>
        ) : null}
      </div>
    </>
  );

  const cardClass = cn(
    "group flex flex-col overflow-hidden rounded-xl border-2 border-storm-ice bg-white shadow-sm",
    "transition hover:border-storm-sky/50 hover:shadow-md",
    href && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-storm-sky",
    className
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cardClass}
        aria-label={`${offer.title} — ${label}`}
      >
        {body}
      </a>
    );
  }

  return <article className={cardClass}>{body}</article>;
}
