import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EditTemplateClient } from "@/components/maintenance-plans/EditTemplateClient";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ id: string }> };

export default async function EditMaintenancePlanTemplatePage({ params }: Props) {
  const { id } = await params;

  return (
    <ContentArea className="max-w-3xl">
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
        <Link href="/maintenance-plans/templates">
          <ArrowLeft className="h-4 w-4" />
          Templates
        </Link>
      </Button>
      <PageHeader breadcrumb={["Maintenance Plans", "Templates", "Edit"]} title="Edit template" />
      <EditTemplateClient templateId={id} />
    </ContentArea>
  );
}
