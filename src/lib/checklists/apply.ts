import { VisitChecklistStatus } from "@prisma/client";
import { filterMatchingTemplates } from "@/lib/checklists/matching";
import { computeChecklistStatus } from "@/lib/checklists/validation";
import { prisma } from "@/lib/prisma";

export async function syncVisitChecklists(visitId: string, companyId: string) {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, companyId },
    include: {
      lineItems: { select: { priceBookItemId: true } },
      visitChecklists: { select: { templateId: true } },
    },
  });
  if (!visit) return;

  const templates = await prisma.checklistTemplate.findMany({
    where: { companyId, active: true },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      lineItemLinks: { select: { priceBookItemId: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  const existingTemplateIds = new Set(
    visit.visitChecklists.map((c) => c.templateId).filter((id): id is string => Boolean(id))
  );

  const matching = filterMatchingTemplates(templates, visit);

  for (const template of matching) {
    if (existingTemplateIds.has(template.id)) continue;

    await prisma.visitChecklist.create({
      data: {
        visitId: visit.id,
        templateId: template.id,
        name: template.name,
        requiredForCompletion: template.requiredForCompletion,
        status: VisitChecklistStatus.NOT_STARTED,
        items: {
          create: template.items.map((item) => ({
            label: item.label,
            helpText: item.helpText,
            type: item.type,
            required: item.required,
            sortOrder: item.sortOrder,
            options: item.options ?? undefined,
            config: item.config ?? undefined,
          })),
        },
      },
    });
  }
}

export async function loadVisitChecklistsForValidation(visitId: string) {
  return prisma.visitChecklist.findMany({
    where: { visitId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { appliedAt: "asc" },
  });
}

export async function recomputeVisitChecklistStatus(visitChecklistId: string) {
  const checklist = await prisma.visitChecklist.findUnique({
    where: { id: visitChecklistId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!checklist) return;

  const status = computeChecklistStatus(checklist.items);
  const completedAt =
    status === VisitChecklistStatus.COMPLETED ? (checklist.completedAt ?? new Date()) : null;

  await prisma.visitChecklist.update({
    where: { id: visitChecklistId },
    data: { status, completedAt },
  });
}

export async function assertVisitCanComplete(visitId: string, companyId: string): Promise<string | null> {
  await syncVisitChecklists(visitId, companyId);
  const checklists = await loadVisitChecklistsForValidation(visitId);
  const { getIncompleteMandatoryChecklistNames } = await import("@/lib/checklists/validation");
  const incomplete = getIncompleteMandatoryChecklistNames(checklists);
  if (!incomplete.length) return null;
  return `Complete required checklists before finishing: ${incomplete.join(", ")}`;
}
