import { OfficeTodoRecurrence } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseOfficeTodoRecurrence,
  shouldReopenRecurringTodo,
  type OfficeTodoDTO,
  type OfficeTodoRecurrence as Recurrence,
} from "@/lib/home/todo-types";

export { canUseOfficeTodos } from "@/lib/home/todo-types";

const todoInclude = {
  createdBy: { select: { name: true } },
  completedBy: { select: { name: true } },
} as const;

type TodoRow = {
  id: string;
  title: string;
  notes: string | null;
  recurrence: OfficeTodoRecurrence;
  recurrenceEvery: number | null;
  completedAt: Date | null;
  createdAt: Date;
  createdBy: { name: string };
  completedBy: { name: string } | null;
};

export function serializeOfficeTodo(row: TodoRow): OfficeTodoDTO {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    recurrence: row.recurrence,
    recurrenceEvery: row.recurrenceEvery,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedByName: row.completedBy?.name ?? null,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
  };
}

async function reopenDueRecurringTodos(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  const timezone = company?.timezone ?? "America/Denver";
  const now = new Date();

  const completedRecurring = await prisma.officeTodo.findMany({
    where: {
      companyId,
      completedAt: { not: null },
      recurrence: { not: OfficeTodoRecurrence.NONE },
    },
    select: { id: true, recurrence: true, recurrenceEvery: true, completedAt: true },
  });

  const reopenIds = completedRecurring
    .filter((todo) =>
      shouldReopenRecurringTodo({
        recurrence: todo.recurrence,
        recurrenceEvery: todo.recurrenceEvery,
        completedAt: todo.completedAt,
        timezone,
        now,
      })
    )
    .map((todo) => todo.id);

  if (reopenIds.length === 0) return;

  await prisma.officeTodo.updateMany({
    where: { companyId, id: { in: reopenIds } },
    data: { completedAt: null, completedById: null },
  });
}

export async function listOfficeTodos(companyId: string) {
  await reopenDueRecurringTodos(companyId);

  const rows = await prisma.officeTodo.findMany({
    where: { companyId },
    include: todoInclude,
    orderBy: [{ completedAt: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return rows.map(serializeOfficeTodo);
}

export async function createOfficeTodo(
  companyId: string,
  createdById: string,
  input: {
    title: string;
    notes?: string | null;
    recurrence?: Recurrence;
    recurrenceEvery?: number | null;
  }
) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");

  const { recurrence, recurrenceEvery } = parseOfficeTodoRecurrence(
    input.recurrence,
    input.recurrenceEvery
  );

  const last = await prisma.officeTodo.findFirst({
    where: { companyId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const row = await prisma.officeTodo.create({
    data: {
      companyId,
      createdById,
      title,
      notes: input.notes?.trim() || null,
      recurrence,
      recurrenceEvery,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
    include: todoInclude,
  });

  return serializeOfficeTodo(row);
}

export async function setOfficeTodoCompleted(
  companyId: string,
  todoId: string,
  completed: boolean,
  userId: string
) {
  const existing = await prisma.officeTodo.findFirst({
    where: { id: todoId, companyId },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await prisma.officeTodo.update({
    where: { id: todoId },
    data: completed
      ? { completedAt: new Date(), completedById: userId }
      : { completedAt: null, completedById: null },
    include: todoInclude,
  });

  return serializeOfficeTodo(row);
}

export async function deleteOfficeTodo(companyId: string, todoId: string) {
  const result = await prisma.officeTodo.deleteMany({
    where: { id: todoId, companyId },
  });
  return result.count > 0;
}
