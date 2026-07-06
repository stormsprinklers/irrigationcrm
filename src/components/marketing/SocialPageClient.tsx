"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ExternalLink, Facebook, Instagram, Loader2, Plus, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { SocialWorkflowSection } from "@/components/marketing/SocialWorkflowPanel";
import {
  MarketingEmptyTable,
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MetaSocialDashboard, MetaSocialPost } from "@/lib/meta/types";

function formatCount(value: number | null | undefined) {
  if (value == null) return undefined;
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return undefined;
  return `${value}%`;
}

function platformLabel(platform: MetaSocialPost["platform"]) {
  return platform === "facebook" ? "Facebook" : "Instagram";
}

function PlatformIcon({ platform }: { platform: MetaSocialPost["platform"] }) {
  if (platform === "facebook") {
    return <Facebook className="h-4 w-4 text-[#1877F2]" aria-hidden />;
  }
  return <Instagram className="h-4 w-4 text-[#E4405F]" aria-hidden />;
}

function SocialPostsTable({ posts }: { posts: MetaSocialPost[] }) {
  if (posts.length === 0) {
    return (
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
        message="No posts yet. Add a Meta access token in Settings → Meta webhooks and click Refresh, or publish content on your Page."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {[
              "Platform",
              "Type",
              "Caption",
              "Published",
              "Reach",
              "Likes",
              "Comments",
              "Shares",
              "Engagement",
            ].map((col) => (
              <th key={col} className="px-3 py-2 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} className="border-b border-border/60">
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <PlatformIcon platform={post.platform} />
                  {platformLabel(post.platform)}
                </span>
              </td>
              <td className="px-3 py-2 capitalize text-muted-foreground">{post.postType}</td>
              <td className="max-w-[240px] truncate px-3 py-2" title={post.caption ?? undefined}>
                {post.permalink ? (
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
                  >
                    <span className="truncate">{post.caption || "View post"}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  post.caption || "—"
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {post.publishedAt ? format(new Date(post.publishedAt), "MMM d, yyyy") : "—"}
              </td>
              <td className="px-3 py-2">{formatCount(post.reach) ?? "—"}</td>
              <td className="px-3 py-2">{formatCount(post.likes) ?? "0"}</td>
              <td className="px-3 py-2">{formatCount(post.comments) ?? "0"}</td>
              <td className="px-3 py-2">{formatCount(post.shares) ?? "0"}</td>
              <td className="px-3 py-2">{formatCount(post.engagement) ?? "0"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SocialPageClient() {
  const [dashboard, setDashboard] = useState<MetaSocialDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    const res = await fetch(
      `/api/marketing/social/dashboard${force ? "?sync=1" : ""}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("Failed to load social dashboard");
    const data = (await res.json()) as MetaSocialDashboard;
    setDashboard(data);
    return data;
  }, []);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load social metrics"))
      .finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load(true);
      toast.success("Synced from Meta");
    } catch {
      toast.error("Failed to refresh from Meta");
    } finally {
      setRefreshing(false);
    }
  }

  const metrics = dashboard?.metrics;
  const showSoon = !dashboard?.configured && dashboard?.needsPageToken;

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Social Media"]}
        title="Social media"
        subtitle="Facebook and Instagram posts, stories, engagement, and content approval workflow."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={loading || refreshing || dashboard?.needsPageToken}
              onClick={() => void refresh()}
            >
              {refreshing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button size="sm" disabled>
              <Plus className="mr-1 h-4 w-4" />
              Submit for review
            </Button>
          </div>
        }
      />

      {dashboard?.syncError ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Could not sync from Meta: {dashboard.syncError}. Showing cached data if available.
        </p>
      ) : null}

      {dashboard?.needsPageToken ? (
        <p className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Add a <strong className="font-medium text-foreground">Meta access token</strong> (User token
          from Graph API Explorer is fine) in{" "}
          <Link href="/settings/integrations/meta" className="text-primary underline">
            Settings → Meta webhooks
          </Link>{" "}
          to load followers, reach, and recent posts.
        </p>
      ) : null}

      {loading ? (
        <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading metrics...
        </div>
      ) : (
        <MarketingMetricGrid
          className="mb-8"
          columns={6}
          comingSoon={showSoon}
          metrics={[
            {
              label: "Facebook followers",
              hint: "Page likes",
              value: formatCount(metrics?.facebookFollowers),
            },
            {
              label: "Instagram followers",
              value: formatCount(metrics?.instagramFollowers),
            },
            {
              label: "Reach (7d)",
              hint: "Facebook Page insights (requires read_insights)",
              value: formatCount(metrics?.reach7d),
            },
            {
              label: "Engagement rate",
              value: formatPercent(metrics?.engagementRate),
            },
            {
              label: "Pending approvals",
              hint: "Awaiting admin review",
              value: metrics?.pendingApprovals ?? 0,
            },
            {
              label: "Scheduled posts",
              value: metrics?.scheduledPosts ?? 0,
            },
          ]}
        />
      )}

      {dashboard?.lastSyncedAt ? (
        <p className="-mt-4 mb-6 text-xs text-muted-foreground">
          Last synced {format(new Date(dashboard.lastSyncedAt), "MMM d, yyyy h:mm a")}
        </p>
      ) : null}

      <Tabs defaultValue="recent" className="space-y-6">
        <TabsList>
          <TabsTrigger value="recent">Recent posts</TabsTrigger>
          <TabsTrigger value="review">Review queue</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="space-y-6">
          <MarketingSectionCard
            title="Recent posts & stories"
            description="Published content and engagement across Facebook and Instagram. Per-post reach requires read_insights (Facebook) and instagram_manage_insights (Instagram) on your Meta token."
            action={
              <Button
                size="sm"
                variant="outline"
                disabled={refreshing || dashboard?.needsPageToken}
                onClick={() => void refresh()}
              >
                {refreshing ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                Sync from Meta
              </Button>
            }
          >
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading posts...
              </div>
            ) : (
              <SocialPostsTable posts={dashboard?.posts ?? []} />
            )}
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
          <SocialWorkflowSection
            title="Review queue"
            description="Social media managers submit posts here. Admins approve, request revisions, or reject."
            tab="review"
          />
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-6">
          <SocialWorkflowSection
            title="Scheduled posts"
            description="Approved posts queued for publishing. The CRM publishes due posts automatically."
            tab="scheduled"
          />
          <SocialWorkflowSection
            title="Ready to schedule"
            description="Approved posts and revision requests. Edit, reschedule, or copy to the other platform."
            tab="mine"
          />
        </TabsContent>
      </Tabs>

      <p className="mt-6 text-xs text-muted-foreground">
        Configure Meta webhooks in{" "}
        <Link href="/settings/integrations/meta" className="text-primary underline">
          Settings → Meta webhooks
        </Link>
        . After verification, Facebook and Instagram DMs will appear in{" "}
        <Link href="/inbox/social/facebook" className="text-primary underline">
          Inbox → Social
        </Link>
        .
      </p>
    </ContentArea>
  );
}
