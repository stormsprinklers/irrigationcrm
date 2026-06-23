import { Facebook, Instagram } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SocialPlatform = "facebook" | "instagram";

const PLATFORMS: Record<
  SocialPlatform,
  {
    title: string;
    icon: typeof Facebook;
    iconClass: string;
    metrics: { label: string }[];
  }
> = {
  facebook: {
    title: "Facebook",
    icon: Facebook,
    iconClass: "text-[#1877F2]",
    metrics: [
      { label: "Page followers" },
      { label: "Reach" },
      { label: "Post engagement" },
      { label: "Link clicks" },
    ],
  },
  instagram: {
    title: "Instagram",
    icon: Instagram,
    iconClass: "text-[#E4405F]",
    metrics: [
      { label: "Followers" },
      { label: "Reach" },
      { label: "Profile views" },
      { label: "Post interactions" },
    ],
  },
};

function SocialMetricsCard({ platform }: { platform: SocialPlatform }) {
  const config = PLATFORMS[platform];
  const Icon = config.icon;

  return (
    <Card className="opacity-90">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${config.iconClass}`} />
          <CardTitle className="text-base">{config.title}</CardTitle>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          Coming soon
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Connect your {config.title} account to track audience and content performance here.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {config.metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5"
            >
              <p className="text-xl font-semibold text-muted-foreground/50">—</p>
              <p className="text-xs text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SocialMetricsPlaceholder() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SocialMetricsCard platform="facebook" />
      <SocialMetricsCard platform="instagram" />
    </div>
  );
}
