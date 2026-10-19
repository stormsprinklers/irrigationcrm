import test from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import { dialAssignedUser } from "./routing";
import { prisma } from "@/lib/prisma";

test("assigned number rings browser and linked-company iPhone identities with original company branding", async (t) => {
  const company = { id: "chestnut", name: "Chestnut & Cheer", recordCalls: false, brandPrimaryColor: "#123456", brandSecondaryColor: "#abcdef" };
  const linked = { id: "stormuser", company: { ...company, id: "storm", name: "Storm Sprinklers", brandPalette: null } };
  const current = { id: "chestnutuser", email: "synthetic@example.test", companyId: company.id, company: { ...company, brandPalette: null } };
  const originalCustomer = prisma.customer.findFirst;
  prisma.customer.findFirst = (async (args: { where: { companyId: string } }) => {
    assert.equal(args.where.companyId, "chestnut");
    return { id: "customer", name: "Sample Caller" };
  }) as unknown as typeof prisma.customer.findFirst;
  const originalFirst = prisma.user.findFirst;
  const originalMany = prisma.user.findMany;
  const originalLinks = prisma.userAccountLink.findMany;
  prisma.user.findFirst = (async () => current) as unknown as typeof prisma.user.findFirst;
  prisma.user.findMany = (async () => [current, linked]) as unknown as typeof prisma.user.findMany;
  prisma.userAccountLink.findMany = (async () => []) as unknown as typeof prisma.userAccountLink.findMany;
  t.after(() => {
    prisma.customer.findFirst = originalCustomer;
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
  assert.equal((xml.match(/name="callerName" value="Sample Caller"/g) ?? []).length, 3);
  assert.equal((xml.match(/name="callerPhone" value="\+18015550100"/g) ?? []).length, 3);
  assert.equal((xml.match(/name="companyName" value="Chestnut &amp; Cheer"/g) ?? []).length, 3);
  assert.match(xml, /dial-complete\?companyId=chestnut/);
  assert.equal((xml.match(/<Client>/g) ?? []).length, 3);
});

test("unavailable customer lookup keeps calls ringing with the caller number and called company", async (t) => {
  const original = prisma.customer.findFirst;
  prisma.customer.findFirst = (async () => { throw new Error("lookup unavailable"); }) as unknown as typeof original;
  t.after(() => { prisma.customer.findFirst = original; });
  const { withVoiceCaller, appendVoiceClients } = await import("./client-dial");
  const brand = await withVoiceCaller({ companyId: "called-company", companyName: "Called Company", brandPrimary: "#123456", brandSoft: "#abcdef" }, "+18015550101");
  const response = new twilio.twiml.VoiceResponse();
  appendVoiceClients(response.dial(), ["ios_other-company_employee"], brand);
  const xml = response.toString();
  assert.match(xml, /name="callerPhone" value="\+18015550101"/);
  assert.match(xml, /name="companyName" value="Called Company"/);
  assert.doesNotMatch(xml, /name="callerName"/);
});
