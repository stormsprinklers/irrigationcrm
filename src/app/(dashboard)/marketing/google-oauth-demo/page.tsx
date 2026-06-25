import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { GoogleOAuthVerificationDemo } from "@/components/marketing/GoogleOAuthVerificationDemo";

export default function GoogleOAuthVerificationDemoPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Google OAuth verification preview"]}
        title="Google OAuth verification preview"
        subtitle="Sample dashboards for your Google OAuth app verification video. Uses demo data only."
      />
      <GoogleOAuthVerificationDemo />
    </ContentArea>
  );
}
