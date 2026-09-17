import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  IMPORTANT_UPDATE_COLORS,
  type ImportantUpdateColor,
  type ImportantUpdateDTO,
} from "./important-update-types";

export { IMPORTANT_UPDATE_COLORS, type ImportantUpdateColor, type ImportantUpdateDTO } from "./important-update-types";

const updateInclude = {
  createdBy: { select: { name: true } },
} as const;

type UpdateRow = {
  id: string;
  title: string;
  body: string | null;
  color: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { name: string };
};

function normalizeColor(value: unknown): ImportantUpdateColor {
  return IMPORTANT_UPDATE_COLORS.includes(value as ImportantUpdateColor)
    ? (value as ImportantUpdateColor)
    : "AMBER";
}

function serializeImportantUpdate(row: UpdateRow): ImportantUpdateDTO {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    color: normalizeColor(row.color),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByName: row.createdBy.name,
  };
}

function normalizedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function listImportantUpdates(companyId: string, now = new Date()) {
  await prisma.importantUpdate.deleteMany({
    where: { companyId, expiresAt: { lte: now } },
  });
  const rows = await prisma.importantUpdate.findMany({
    where: { companyId, expiresAt: { gt: now } },
    include: updateInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeImportantUpdate);
}

export async function createImportantUpdate(
  companyId: string,
  createdById: string,
  input: { title: unknown; body?: unknown; color?: unknown }
) {
  const title = normalizedText(input.title, 140);
  if (!title) throw new Error("Title is required");
  const body = normalizedText(input.body, 2_000) || null;
  const row = await prisma.importantUpdate.create({
    data: {
      companyId,
      createdById,
      title,
      body,
      color: normalizeColor(input.color),
      expiresAt: addDays(new Date(), 7),
    },
    include: updateInclude,
  });
  return serializeImportantUpdate(row);
}

export async function updateImportantUpdate(
  companyId: string,
  updateId: string,
  input: { title?: unknown; body?: unknown; color?: unknown }
) {
  const existing = await prisma.importantUpdate.findFirst({
    where: { id: updateId, companyId, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!existing) return null;

  const data: { title?: string; body?: string | null; color?: ImportantUpdateColor } = {};
  if (input.title !== undefined) {
    const title = normalizedText(input.title, 140);
    if (!title) throw new Error("Title is required");
    data.title = title;
  }
  if (input.body !== undefined) data.body = normalizedText(input.body, 2_000) || null;
  if (input.color !== undefined) data.color = normalizeColor(input.color);
  if (!Object.keys(data).length) throw new Error("Nothing to update");

  const row = await prisma.importantUpdate.update({
    where: { id: existing.id },
    data,
    include: updateInclude,
  });
  return serializeImportantUpdate(row);
}

export async function deleteImportantUpdate(companyId: string, updateId: string) {
  const result = await prisma.importantUpdate.deleteMany({
    where: { id: updateId, companyId },
  });
  return result.count > 0;
}
