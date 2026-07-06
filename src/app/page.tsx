import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicHomePage } from "@/components/public/PublicHomePage";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Irrigation CRM",
  description:
    "Irrigation CRM is the internal business operations platform used by Storm Sprinklers to manage customers, scheduling, marketing, and reporting.",
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default async function RootPublicPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/home");
  }

  return <PublicHomePage />;
}
