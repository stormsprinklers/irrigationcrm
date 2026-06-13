import { InboxChannelView } from "@/components/inbox/InboxChannelView";

type PageProps = {
  params: Promise<{ channel: string; scope: string }>;
};

export default async function InboxChannelPage({ params }: PageProps) {
  const { channel, scope } = await params;
  return <InboxChannelView channel={channel} scope={scope} />;
}
