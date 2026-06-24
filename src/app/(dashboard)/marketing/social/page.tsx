import Link from "next/link";
import { Facebook, Instagram, Plus, Upload } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetaWebhookSetup } from "@/components/marketing/MetaWebhookSetup";
import {
  MarketingEmptyTable,
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MarketingSocialPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Social Media"]}
        title="Social media"
        subtitle="Facebook and Instagram posts, stories, engagement, and content approval workflow."
        actions={
          <Button size="sm" disabled>
            <Plus className="mr-1 h-4 w-4" />
            Submit for review
          </Button>
        }
      />

      <MarketingMetricGrid
        className="mb-8"
        columns={6}
        metrics={[
          { label: "Facebook followers", hint: "Page likes" },
          { label: "Instagram followers" },
          { label: "Reach (7d)" },
          { label: "Engagement rate" },
          { label: "Pending approvals", hint: "Awaiting admin review" },
          { label: "Scheduled posts" },
        ]}
      />

      <Tabs defaultValue="setup" className="space-y-6">
        <TabsList>
          <TabsTrigger value="setup">Meta webhooks</TabsTrigger>
          <TabsTrigger value="recent">Recent posts</TabsTrigger>
          <TabsTrigger value="review">Review queue</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <MetaWebhookSetup />
        </TabsContent>

        <TabsContent value="recent" className="space-y-6">
          <MarketingSectionCard
            title="Recent posts & stories"
            description="Published content and engagement across Facebook and Instagram."
          >
            <MarketingEmptyTable
              columns={[
                "Platform",
                "Type",
                "Caption",
                "Published",
                "Reach",
                "Likes",
                "Comments",
                "Shares",
                "Engagement",
              ]}
              message="Connect Facebook and Instagram to see recent posts and engagement metrics."
            />
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
          <MarketingSectionCard
            title="Submit content for approval"
            description="Social media managers upload images and videos here. Designated admins approve before scheduling."
            action={
              <Badge variant="outline" className="text-xs">
                Admin approval required
              </Badge>
            }
          >
            <div className="mb-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
              <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Upload images or videos</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Drag and drop media, add caption and platform (post or story). Submissions enter the
                review queue for management approval before they are scheduled.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="outline" disabled>
                  <Facebook className="mr-1.5 h-4 w-4 text-[#1877F2]" />
                  Facebook
                </Button>
                <Button size="sm" variant="outline" disabled>
                  <Instagram className="mr-1.5 h-4 w-4 text-[#E4405F]" />
                  Instagram
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Media upload — coming soon</p>
            </div>

            <h3 className="mb-3 text-sm font-medium">Pending review</h3>
            <MarketingEmptyTable
              columns={[
                "Submitted by",
                "Platform",
                "Type",
                "Caption",
                "Scheduled for",
                "Status",
                "Actions",
              ]}
              message="No submissions awaiting review. Approved posts move to the scheduled queue."
            />
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="scheduled">
          <MarketingSectionCard
            title="Approved & scheduled"
            description="Content approved by management, queued for automatic publishing."
          >
            <MarketingEmptyTable
              columns={[
                "Platform",
                "Type",
                "Caption",
                "Scheduled",
                "Approved by",
                "Status",
              ]}
              message="No scheduled posts. Approved content will appear here once integrations are connected."
            />
          </MarketingSectionCard>
        </TabsContent>
      </Tabs>

      <p className="mt-6 text-xs text-muted-foreground">
        After webhooks are verified, Facebook and Instagram DMs will appear in{" "}
        <Link href="/inbox/social/facebook" className="text-primary underline">
          Inbox → Social
        </Link>
        .
      </p>
    </ContentArea>
  );
}
