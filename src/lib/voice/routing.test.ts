import test from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import { dialAssignedUser } from "./routing";
import { prisma } from "@/lib/prisma";

test("assigned number rings browser and linked-company iPhone identities with original company branding", async (t) => {
  const company = { id: "chestnut", name: "Chestnut & Cheer", recordCalls: false, brandPrimaryColor: "#123456", brandSecondaryColor: "#abcdef" };
  const linked = { id: "stormuser", company: { ...company, id: "storm", name: "Storm Sprinklers", brandPalette: null } };
  const current = { id: "chestnutuser", email: "synthetic@example.test", companyId: company.id, company: { ...company, brandPalette: null } };
  const originalFirst = prisma.user.findFirst;
  const originalMany = prisma.user.findMany;
  const originalLinks = prisma.userAccountLink.findMany;
  prisma.user.findFirst = (async () => current) as unknown as typeof prisma.user.findFirst;
  prisma.user.findMany = (async () => [current, linked]) as unknown as typeof prisma.user.findMany;
  prisma.userAccountLink.findMany = (async () => []) as unknown as typeof prisma.userAccountLink.findMany;
  t.after(() => {
    prisma.user.findFirst = originalFirst;
    prisma.user.findMany = originalMany;
    prisma.userAccountLink.findMany = originalLinks;
  });
  const response = new twilio.twiml.VoiceResponse();
  await dialAssignedUser(response, company, current.id, "+18015550100");
  const xml = response.toString();
  assert.match(xml, /<Client>chestnut_chestnutuser/);
  assert.match(xml, /<Client>ios_chestnut_chestnutuser/);
  assert.match(xml, /<Client>ios_storm_stormuser/);
  assert.equal((xml.match(/name="companyId" value="chestnut"/g) ?? []).length, 3);
  assert.match(xml, /dial-complete\?companyId=chestnut/);
  assert.equal((xml.match(/<Client>/g) ?? []).length, 3);
});
