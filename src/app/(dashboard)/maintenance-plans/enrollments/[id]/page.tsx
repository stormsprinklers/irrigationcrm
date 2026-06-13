import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EnrollmentDetailClient } from "@/components/maintenance-plans/EnrollmentDetailClient";
import { ContentArea } from "@/components/layout/ContentArea";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ id: string }> };

export default async function EnrollmentPage({ params }: Props) {
  const { id } = await params;

  return (
    <ContentArea className="max-w-5xl">
      <Button variant="ghost" size="sm" className="-ml-2 mb-4" asChild>
        <Link href="/maintenance-plans">
          <ArrowLeft className="h-4 w-4" />
          Maintenance plans
        </Link>
      </Button>
      <EnrollmentDetailClient enrollmentId={id} />
    </ContentArea>
  );
}
