export type MetaSocialMetrics = {
  facebookFollowers: number | null;
  instagramFollowers: number | null;
  reach7d: number | null;
  engagementRate: number | null;
  pendingApprovals: number;
  scheduledPosts: number;
};

export type MetaSocialPost = {
  id: string;
  platform: "facebook" | "instagram";
  postType: string;
  caption: string | null;
  permalink: string | null;
  publishedAt: string | null;
  likes: number;
  comments: number;
  shares: number;
  reach: number | null;
  engagement: number;
};

export type MetaSocialDashboard = {
  configured: boolean;
  needsPageToken: boolean;
  lastSyncedAt: string | null;
  metrics: MetaSocialMetrics;
  posts: MetaSocialPost[];
  syncError: string | null;
};
