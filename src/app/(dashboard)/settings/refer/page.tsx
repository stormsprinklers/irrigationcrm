"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCompanySettings } from "@/components/settings/useCompanySettings";
import { toast } from "sonner";

export default function SettingsReferPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();
  const code = company?.referralCode ?? "STORM-REF";

  function copyCode() {
    navigator.clipboard.writeText(code);
    toast.success("Referral code copied");
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader breadcrumb={["Settings", "Refer a Friend"]} title="Refer a Friend" />
      {loading || !company ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Share Storm Sprinklers CRM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Refer another irrigation company and earn account credits when they sign up.
            </p>
            <div>
              <label className="text-muted-foreground">Your referral code</label>
              <div className="mt-1 flex gap-2">
                <Input
                  value={company.referralCode ?? ""}
                  placeholder="STORM-REF"
                  onChange={(e) => setCompany({ ...company, referralCode: e.target.value })}
                />
                <Button variant="outline" onClick={copyCode}>Copy</Button>
              </div>
            </div>
            <Button onClick={() => save({ referralCode: company.referralCode })} disabled={saving}>
              {saving ? "Saving..." : "Save code"}
            </Button>
          </CardContent>
        </Card>
      )}
    </ContentArea>
  );
}
