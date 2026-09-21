import { NewEstimatePage } from "@/components/estimates/NewEstimatePage";
import { ContentArea } from "@/components/layout/ContentArea";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/api-auth";
import { holidayEstimateWizardUrl } from "@/lib/holiday-lighting/routes";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

export default async function NewEstimateRoutePage({ searchParams }: PageProps) {
  const user = await requireSessionUser();
  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { holidayLightingFeaturesEnabled: true },
  });

  if (company?.holidayLightingFeaturesEnabled) {
    const query = await searchParams;
    const visitId = stringParam(query.visitId);
    const visit = visitId
      ? await prisma.visit.findFirst({
          where: { id: visitId, companyId: user.companyId },
          select: {
            customerId: true,
            propertyId: true,
            address: true,
            city: true,
            state: true,
            zip: true,
            customer: { select: { name: true } },
            property: {
              select: { address: true, city: true, state: true, zip: true },
            },
          },
        })
      : null;

    redirect(
      holidayEstimateWizardUrl({
        customerId: stringParam(query.customerId) ?? visit?.customerId,
        customerName: stringParam(query.customerName) ?? visit?.customer?.name,
        propertyId: stringParam(query.propertyId) ?? visit?.propertyId,
        visitId,
        address: stringParam(query.address) ?? visit?.address ?? visit?.property?.address,
        city: stringParam(query.city) ?? visit?.city ?? visit?.property?.city,
        state: stringParam(query.state) ?? visit?.state ?? visit?.property?.state,
        zip: stringParam(query.zip) ?? visit?.zip ?? visit?.property?.zip,
      })
    );
  }

  return (
    <ContentArea className="max-w-6xl">
      <NewEstimatePage />
    </ContentArea>
  );
}
