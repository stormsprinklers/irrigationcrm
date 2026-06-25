import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function splitFullName(name) {
  const trimmed = name.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

function formatEmployeeName(firstName, lastName) {
  return [firstName.trim(), lastName?.trim()].filter(Boolean).join(" ");
}

const users = await prisma.user.findMany({
  select: { id: true, firstName: true, lastName: true, name: true },
});

let updated = 0;
for (const user of users) {
  const needsBackfill = !user.firstName && user.name;
  if (!needsBackfill) continue;

  const { firstName, lastName } = splitFullName(user.name);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      firstName,
      lastName,
      name: formatEmployeeName(firstName, lastName),
    },
  });
  updated++;
}

console.log(`Backfilled ${updated} employee name(s).`);

await prisma.$disconnect();
