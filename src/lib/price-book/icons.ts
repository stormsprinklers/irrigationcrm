import {
  Droplets,
  Flower2,
  Gauge,
  Package,
  Shovel,
  Timer,
  Waves,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

const SLUG_ICONS: Record<string, LucideIcon> = {
  backflow: Gauge,
  "stop-waste": Wrench,
  "heads-nozzles": Droplets,
  leaks: Waves,
  controllers: Timer,
  "valves-wiring": Zap,
  drip: Flower2,
  other: Shovel,
};

export function getCategoryIcon(slug: string): LucideIcon {
  return SLUG_ICONS[slug] ?? Package;
}
