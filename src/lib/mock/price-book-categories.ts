import {
  Droplets,
  Flower2,
  Gauge,
  Shovel,
  Timer,
  Waves,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type PriceBookCategory = {
  id: string;
  name: string;
  icon: LucideIcon;
};

export const priceBookCategories: PriceBookCategory[] = [
  { id: "backflow", name: "Backflow", icon: Gauge },
  { id: "stop-waste", name: "Stop & Waste", icon: Wrench },
  { id: "heads-nozzles", name: "Heads & Nozzles", icon: Droplets },
  { id: "leaks", name: "Leaks", icon: Waves },
  { id: "controllers", name: "Controllers", icon: Timer },
  { id: "valves-wiring", name: "Valves & Wiring", icon: Zap },
  { id: "drip", name: "Drip", icon: Flower2 },
  { id: "other", name: "Other", icon: Shovel },
];

export const priceBookBreadcrumb = [
  "Price book",
  "Services",
  "Landscaping & Lawn",
  "Repair",
];
