"use client";

import { useSession } from "next-auth/react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { RolePreviewQuickSwitch } from "@/components/layout/RolePreviewBanner";
import {
  canUseRolePreview,
  isRolePreviewActive,
  rolePreviewLabel,
  trueRoleOf,
} from "@/lib/role-preview";

export default function RolePreviewSettingsPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader
          breadcrumb={["Settings", "Role preview"]}
          title="Role preview"
          subtitle="Loading…"
        />
      </ContentArea>
    );
  }

  if (!session?.user || !canUseRolePreview(session.user)) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader
          breadcrumb={["Settings", "Role preview"]}
          title="Role preview"
          subtitle="Only admins can preview other roles"
        />
        <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          You need an Admin account to use this training tool.
        </section>
      </ContentArea>
    );
  }

  const previewing = isRolePreviewActive(session.user);

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Role preview"]}
        title="Role preview"
        subtitle="Temporarily view the CRM as another role for training and permission testing"
      />

      <section className="mb-6 rounded-lg border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Current view</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {session.user.name} ({trueRoleOf(session.user)}).
          {previewing ? (
            <>
              {" "}
              You are previewing as <strong>{rolePreviewLabel(session.user.role)}</strong>. Menus,
              pages, and APIs enforce that role&apos;s permissions. Your real admin account is
              unchanged.
            </>
          ) : (
            <> You are using your Admin permissions.</>
          )}
        </p>

        <div className="mt-6">
          <p className="mb-2 text-sm font-medium">Switch to</p>
          <RolePreviewQuickSwitch />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        <h3 className="text-base font-semibold text-foreground">How it works</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            Preview is session-only — it does not change your employee role in Team settings.
          </li>
          <li>
            While previewing, a banner stays at the top so you can exit to Admin or open this page
            to switch roles.
          </li>
          <li>
            Technician preview uses your own user id for assigned visits (you will not see another
            tech&apos;s route unless visits are assigned to you).
          </li>
          <li>Settings stays available so you can always switch back.</li>
        </ul>
      </section>
    </ContentArea>
  );
}
