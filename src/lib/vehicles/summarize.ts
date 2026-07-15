import { prisma } from "@/lib/prisma";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { oilStatusLabel } from "@/lib/vehicles/oil";
import { assigneeLabel, vehicleDisplayName } from "@/lib/vehicles/types";

const SUMMARY_SYSTEM_PROMPT = `You write one-paragraph summaries of company fleet vehicles for an irrigation / sprinkler field-service company (Storm Sprinklers).

Rules:
- Output exactly one concise paragraph (3–6 sentences). No bullets, headings, or labels.
- Cover vehicle identity (year/make/model, plate if present), who it is assigned to (or Shop), current mileage and oil-change status, notable recent service, and any open issues.
- Mention notable document types only if present (receipts, Carfax, etc.).
- Do not invent details that are not in the provided data.
- Write in present tense, third person.`;

export async function generateVehicleSummaryFromContext(context: string): Promise<string> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const trimmed = context.trim();
  if (!trimmed) {
    throw new Error("Vehicle context is empty");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Summarize this vehicle profile:\n\n${trimmed.slice(0, 12000)}`,
        },
      ],
      max_tokens: 350,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `OpenAI summary failed (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const summary = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!summary) {
    throw new Error("OpenAI returned an empty summary");
  }
  return summary;
}

function buildVehicleContext(vehicle: NonNullable<Awaited<ReturnType<typeof loadVehicleForSummary>>>) {
  const oil = oilStatusLabel({
    nextOilChangeDueAt: vehicle.nextOilChangeDueAt,
    nextOilChangeDueMileage: vehicle.nextOilChangeDueMileage,
    currentMileage: vehicle.currentMileage,
  });

  const lines = [
    `Vehicle: ${vehicleDisplayName(vehicle)}`,
    `VIN: ${vehicle.vin ?? "n/a"}`,
    `Status: ${vehicle.status}`,
    `Assigned to: ${assigneeLabel(vehicle.assignedUser)}`,
    `Current mileage: ${vehicle.currentMileage}`,
    `Oil status: ${oil}`,
    `Last oil change: ${
      vehicle.lastOilChangeAt
        ? `${vehicle.lastOilChangeAt.toISOString().slice(0, 10)} at ${vehicle.lastOilChangeMileage ?? "unknown"} miles`
        : "unknown"
    }`,
    `Next oil due: date=${vehicle.nextOilChangeDueAt?.toISOString().slice(0, 10) ?? "n/a"}, mileage=${vehicle.nextOilChangeDueMileage ?? "n/a"}`,
    `Oil intervals: ${vehicle.oilIntervalMiles} miles / ${vehicle.oilIntervalMonths} months`,
    vehicle.notes ? `Notes: ${vehicle.notes}` : null,
    `Open issues (${vehicle.issues.length}): ${
      vehicle.issues.length
        ? vehicle.issues.map((i) => `${i.title} [${i.status}]${i.description ? `: ${i.description}` : ""}`).join("; ")
        : "none"
    }`,
    `Recent service (${vehicle.serviceRecords.length}): ${
      vehicle.serviceRecords.length
        ? vehicle.serviceRecords
            .map(
              (s) =>
                `${s.performedAt.toISOString().slice(0, 10)} ${s.title}${s.description ? ` — ${s.description}` : ""}${s.mileageAtService != null ? ` @ ${s.mileageAtService} mi` : ""}`
            )
            .join("; ")
        : "none"
    }`,
    `Documents: ${
      vehicle.attachments.length
        ? Object.entries(
            vehicle.attachments.reduce<Record<string, number>>((acc, a) => {
              acc[a.kind] = (acc[a.kind] ?? 0) + 1;
              return acc;
            }, {})
          )
            .map(([kind, count]) => `${kind}=${count}`)
            .join(", ")
        : "none"
    }`,
  ];

  return lines.filter(Boolean).join("\n");
}

async function loadVehicleForSummary(vehicleId: string, companyId: string) {
  return prisma.vehicle.findFirst({
    where: { id: vehicleId, companyId },
    include: {
      assignedUser: { select: { id: true, name: true, photoUrl: true } },
      issues: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: { reportedAt: "desc" },
        take: 10,
      },
      serviceRecords: {
        orderBy: { performedAt: "desc" },
        take: 5,
      },
      attachments: {
        select: { kind: true },
        take: 50,
      },
    },
  });
}

export async function summarizeVehicle(
  vehicleId: string,
  companyId: string,
  options?: { force?: boolean }
): Promise<{ ok: boolean; summary?: string; skipped?: string }> {
  const vehicle = await loadVehicleForSummary(vehicleId, companyId);
  if (!vehicle) return { ok: false, skipped: "Vehicle not found" };
  if (vehicle.aiSummary?.trim() && !options?.force) {
    return { ok: true, summary: vehicle.aiSummary, skipped: "Already summarized" };
  }

  const summary = await generateVehicleSummaryFromContext(buildVehicleContext(vehicle));
  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { aiSummary: summary },
  });

  return { ok: true, summary };
}
