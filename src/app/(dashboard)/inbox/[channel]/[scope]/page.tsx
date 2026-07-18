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
  if (channel === "voice" && (scope === "customers" || scope === "team")) {
    redirect("/inbox/voice/desk");
  }
  if (channel === "social") {
    redirect("/inbox/social");
  }
  return <InboxChannelView channel={channel} scope={scope} />;
}
