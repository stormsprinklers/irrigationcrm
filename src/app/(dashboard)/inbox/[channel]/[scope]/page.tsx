import { redirect } from "next/navigation";
import { InboxChannelView } from "@/components/inbox/InboxChannelView";

type PageProps = {
  params: Promise<{ channel: string; scope: string }>;
};

export default async function InboxChannelPage({ params }: PageProps) {
  const { channel, scope } = await params;
  if (channel === "email") {
    redirect("/inbox/leads");
  }
  return <InboxChannelView channel={channel} scope={scope} />;
}
